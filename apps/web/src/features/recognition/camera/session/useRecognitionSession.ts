import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RecognitionSessionOutcome,
  RecognitionSessionSummary,
  RecognitionSource,
} from "@riichi/core";
import { useSession } from "@/api/session";
import { reportRecognitionSession } from "../../api";
import { RECOGNITION_MODEL } from "../../modelUrl";
import type { Detector } from "../../worker/client";
import type { FrameResult } from "../../worker/protocol";
import type { CaptureState } from "../autoCapture";
import type { RotationSource } from "../orientation/useRotation";
import { EMPTY_SAMPLER, nextSample, recordSample, type SamplerState } from "./sampler";
import { countFrame, createStats, statsPart } from "./stats";
import { uploadSession, type PendingSample } from "./upload";

/** 收场那一刻才知道的几样：界面方向、取景区域多大 */
interface Closing {
  rotation: RecognitionSessionSummary["rotation"];
  rotationSource: RotationSource;
  viewport: { width: number; height: number } | null;
}

/** 16 位 hex 的会话 id（64 位随机数）：摘要、采样帧、定格记录靠它串联，所以由手机端生成 */
function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 一次取景会话：逐帧统计 + 采样帧，取景页关掉时上报。
 * 留存的识别记录只有定格成功的那一帧；「一直 0/3、最后放弃了」这种会话，只有这里看得见为什么。
 * 累计值放 ref：每帧都在变，没有任何界面要读它。
 */
export function useRecognitionSession(
  source: RecognitionSource,
  detector: Detector | null,
  closing: Closing,
): {
  /** 会话 id：定格照上传时带上（`?session=`），与这里的摘要、采样帧串起来 */
  id: string;
  onFrame: (r: FrameResult, gate: CaptureState) => void;
  /** 定格了：记下是怎么定的（没调用过就是「放弃」） */
  finish: (outcome: Exclude<RecognitionSessionOutcome, "abandoned">) => void;
  /** 在途的采样（关线程前等它们编码完） */
  pending: () => Promise<unknown>;
} {
  const [id] = useState(newSessionId);
  const acc = useRef({
    startedAt: 0,
    firstFrameAt: null as number | null,
    capturedAt: null as number | null,
    outcome: "abandoned" as RecognitionSessionOutcome,
    stats: createStats(),
    sampler: EMPTY_SAMPLER as SamplerState<PendingSample>,
    /** 摘要发过了（pagehide 时先发）；采样帧另算——页面从往返缓存回来后还可能接着取景、放弃 */
    summarySent: false,
    /** 卸载收尾做过了（摘要补发 + 采样上传），只做一次 */
    finished: false,
    closing: 0 as ReturnType<typeof setTimeout> | 0,
  });
  const closingRef = useRef(closing);
  const detectorRef = useRef(detector);
  useEffect(() => {
    closingRef.current = closing;
    detectorRef.current = detector;
  });

  const onFrame = useCallback((r: FrameResult, gate: CaptureState) => {
    const a = acc.current;
    const now = Date.now();
    a.firstFrameAt ??= now;
    countFrame(a.stats, r, gate);
    // 定格之后不再采：Worker 正忙着给定格照编码，别跟它抢
    const d = detectorRef.current;
    if (a.outcome !== "abandoned" || !d) return;
    const action = nextSample(a.sampler, r, now);
    if (!action) return;
    const item = { at: now, sampled: d.sample(r.frameId) };
    a.sampler = recordSample(a.sampler, action, r, item, now);
  }, []);

  const finish = useCallback((outcome: Exclude<RecognitionSessionOutcome, "abandoned">) => {
    acc.current.outcome = outcome;
    acc.current.capturedAt = Date.now();
  }, []);

  const pending = useCallback(
    () => Promise.all(acc.current.sampler.slots.map((s) => s.item.sampled)),
    [],
  );

  useEffect(() => {
    const a = acc.current;
    // 开发模式的 StrictMode 会假卸载再挂回来：上报推迟一拍，挂回来就取消
    clearTimeout(a.closing);
    if (a.startedAt === 0) a.startedAt = Date.now();
    const summarize = (): RecognitionSessionSummary & { id: string } => {
      const { rotation, rotationSource, viewport } = closingRef.current;
      return {
        id,
        source,
        outcome: a.outcome,
        modelId: RECOGNITION_MODEL?.id ?? null,
        durationMs: Date.now() - a.startedAt,
        ...statsPart(a.stats),
        rotation,
        rotationSource,
        viewport: viewport ? `${viewport.width}x${viewport.height}` : "0x0",
      };
    };
    // 关标签页、跳去别的页面不会触发卸载：这时来不及注册，只有已经有身份的才发得出去；
    // 也只发摘要——keepalive 请求限 64 KB，带不了照片
    const onHide = () => {
      const token = useSession.getState().token;
      if (a.summarySent || !token) return;
      a.summarySent = true;
      void reportRecognitionSession(summarize(), token).catch(() => undefined);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      // 正常关闭取景页：还没身份的（算点数页第一次用就放弃）先注册再发
      a.closing = setTimeout(() => {
        if (a.finished) return;
        a.finished = true;
        const summary = summarize();
        const sendSummary = !a.summarySent;
        a.summarySent = true;
        void useSession
          .getState()
          .ensure()
          .then(({ token }) =>
            uploadSession(
              {
                summary,
                sendSummary,
                samples: a.sampler.slots.map((s) => s.item),
                firstFrameAt: a.firstFrameAt,
                capturedAt: a.capturedAt,
              },
              token,
            ),
          )
          .catch(() => undefined);
      }, 0);
    };
  }, [id, source]);

  return { id, onFrame, finish, pending };
}
