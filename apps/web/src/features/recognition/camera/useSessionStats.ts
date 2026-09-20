import { useCallback, useEffect, useRef } from "react";
import type {
  RecognitionSessionOutcome,
  RecognitionSessionSummary,
  RecognitionSource,
} from "@riichi/core";
import { useSession } from "@/api/session";
import { reportRecognitionSession } from "../api";
import { RECOGNITION_MODEL } from "../modelUrl";
import type { FrameResult } from "../worker/protocol";
import { handKey, votesOf, type CaptureState } from "./autoCapture";
import type { RotationSource } from "./orientation/useRotation";

/** 收场那一刻才知道的几样：界面方向、取景区域多大 */
interface Closing {
  rotation: RecognitionSessionSummary["rotation"];
  rotationSource: RotationSource;
  viewport: { width: number; height: number } | null;
}

/**
 * 一次取景会话的统计，取景页关掉时上报一条（不含照片）。
 * 留存的识别记录只有定格成功的那一帧；「一直 0/3、最后放弃了」这种会话，只有这里看得见为什么。
 * 累计值放 ref：每帧都在变，没有任何界面要读它。
 */
export function useSessionStats(
  source: RecognitionSource,
  closing: Closing,
): {
  onFrame: (r: FrameResult, gate: CaptureState) => void;
  /** 定格了：记下是怎么定的（没调用过就是「放弃」） */
  finish: (outcome: Exclude<RecognitionSessionOutcome, "abandoned">) => void;
} {
  const acc = useRef({
    startedAt: 0,
    outcome: "abandoned" as RecognitionSessionOutcome,
    frames: 0,
    settledFrames: 0,
    secondPasses: 0,
    msSum: 0,
    blocking: {} as RecognitionSessionSummary["blocking"],
    keyChanges: 0,
    lastKey: null as string | null,
    maxVotes: 0,
    video: "0x0",
    sent: false,
    closing: 0 as ReturnType<typeof setTimeout> | 0,
  });
  const closingRef = useRef(closing);
  useEffect(() => {
    closingRef.current = closing;
  });

  const onFrame = useCallback((r: FrameResult, gate: CaptureState) => {
    const a = acc.current;
    a.frames += 1;
    a.msSum += r.ms;
    if (r.passes > 1) a.secondPasses += 1;
    a.video = `${r.frame.width}x${r.frame.height}`;
    a.maxVotes = Math.max(a.maxVotes, votesOf(gate));
    if (!r.settled) return;
    a.settledFrames += 1;
    const block = r.warnings.find((w) => w.severity === "blocking");
    if (block) {
      a.blocking[block.code] = (a.blocking[block.code] ?? 0) + 1;
      return;
    }
    const key = handKey(r.hand);
    if (a.lastKey !== null && a.lastKey !== key) a.keyChanges += 1;
    a.lastKey = key;
  }, []);

  const finish = useCallback((outcome: Exclude<RecognitionSessionOutcome, "abandoned">) => {
    acc.current.outcome = outcome;
  }, []);

  useEffect(() => {
    const a = acc.current;
    // 开发模式的 StrictMode 会假卸载再挂回来：上报推迟一拍，挂回来就取消
    clearTimeout(a.closing);
    if (a.startedAt === 0) a.startedAt = Date.now();
    const summarize = (): RecognitionSessionSummary => {
      const { rotation, rotationSource, viewport } = closingRef.current;
      return {
        source,
        outcome: a.outcome,
        modelId: RECOGNITION_MODEL?.id ?? null,
        durationMs: Date.now() - a.startedAt,
        frames: a.frames,
        settledFrames: a.settledFrames,
        secondPasses: a.secondPasses,
        msAvg: a.frames > 0 ? Math.round(a.msSum / a.frames) : 0,
        blocking: a.blocking,
        keyChanges: a.keyChanges,
        maxVotes: a.maxVotes,
        rotation,
        rotationSource,
        video: a.video,
        viewport: viewport ? `${viewport.width}x${viewport.height}` : "0x0",
      };
    };
    const send = (token: string | null) => {
      if (a.sent || !token) return;
      a.sent = true;
      void reportRecognitionSession(summarize(), token).catch(() => undefined);
    };
    // 关标签页 / 切走不会触发卸载：这时来不及注册，只有已经有身份的才发得出去
    const onHide = () => send(useSession.getState().token);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      // 正常关闭取景页：还没身份的（算点数页第一次用就放弃）先注册再发
      a.closing = setTimeout(() => {
        void useSession
          .getState()
          .ensure()
          .then(({ token }) => send(token))
          .catch(() => undefined);
      }, 0);
    };
  }, [source]);

  return { onFrame, finish };
}
