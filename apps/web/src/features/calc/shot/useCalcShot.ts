import { useRef, useState } from "react";
import type { Detection, RoomRules } from "@riichi/core";
import { useSession } from "@/api/session";
import { applyRecognized } from "@/features/recognition/applyRecognized";
import type { Capture } from "@/features/recognition/camera/CameraSheet";
import { confirmRecognized, uploadRecognition } from "@/features/recognition/recognize";
import {
  createValueDraft,
  isHandComplete,
  type ValueDraft,
} from "@/features/settlement/valueDraft";
import { useRoomStore } from "@/ws/store";

/** idle：还没拍；review：核对识别结果；result：已确认，看番符与点数 */
export type CalcPhase = "idle" | "review" | "result";

const UPLOAD_FAILED = "照片留存失败，不影响算点数";

/**
 * 一手牌从拍到算的流程状态。照片在定格时就上传留存（与房间一致）；
 * 「识别正确」把当时的手牌回填为训练真值，多次确认按顺序落库。
 */
export function useCalcShot(rules: RoomRules) {
  const [phase, setPhase] = useState<CalcPhase>("idle");
  const [shooting, setShooting] = useState(false);
  const [draft, setDraft] = useState<ValueDraft>(() => createValueDraft(false, "hand"));
  /** 定格帧与检测框：核对时回看 */
  const [shot, setShot] = useState<{ photo: Blob; detections: Detection[] } | null>(null);
  const confirms = useRef<Promise<void>>(Promise.resolve());

  const onCapture = ({ blob, result }: Capture) => {
    setShooting(false);
    setShot({ photo: blob, detections: result.detections });
    setPhase("review");
    // 不用 crypto.randomUUID：它只在安全上下文可用，开发机是 HTTP
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    // 每张都从空草稿起：上一手的立直、一发不该带进来；荣和/自摸是场况，保留
    setDraft((d) => applyRecognized(createValueDraft(d.hand.tsumo, "hand"), result, rules, key));
    const notifyFailed = () => useRoomStore.getState().notify("error", UPLOAD_FAILED);
    void useSession
      .getState()
      .ensure()
      .then(({ token }) =>
        uploadRecognition(
          key,
          blob,
          result,
          token,
          "label",
          (id) =>
            setDraft((d) =>
              d.recognition?.key === key ? { ...d, recognition: { ...d.recognition, id } } : d,
            ),
          notifyFailed,
        ),
      )
      .catch(notifyFailed);
  };

  const confirm = () => {
    if (phase !== "review" || !isHandComplete(draft.hand)) return;
    setPhase("result");
    const confirmed = draft;
    confirms.current = confirms.current.then(() =>
      useSession
        .getState()
        .ensure()
        .then(({ token }) => confirmRecognized(confirmed, token))
        .catch(() => undefined),
    );
  };

  return {
    phase,
    shooting,
    draft,
    shot,
    setDraft,
    onCapture,
    confirm,
    /** 打开取景：开始拍、重新拍都走这里，没定格就关掉时停在原来的阶段 */
    shoot: () => setShooting(true),
    closeCamera: () => setShooting(false),
    backToReview: () => setPhase("review"),
    /** 继续拍：清掉这一手，直接打开取景 */
    next: () => {
      setDraft((d) => createValueDraft(d.hand.tsumo, "hand"));
      setShot(null);
      setPhase("idle");
      setShooting(true);
    },
    setTsumo: (tsumo: boolean) =>
      setDraft((d) =>
        d.hand.tsumo === tsumo
          ? d
          : {
              ...d,
              // 岭上/抢杠、海底/河底、天地/人和随荣和自摸互换含义：留着会悄悄变成另一个役
              hand: { ...d.hand, tsumo, afterKan: false, lastTile: false, firstTake: false },
              evaluated: null,
            },
      ),
  };
}
