import type { ClientWinValue, EvaluatedHand, HandInput, HandValue } from "@riichi/core";
import type { DraftRecognition } from "@/features/recognition/applyRecognized";

export interface ValueDraft {
  mode: "manual" | "hand";
  han: number;
  fu: number;
  yakuman: number;
  hand: HandInput;
  evaluated: EvaluatedHand | null;
  /** 牌面来自拍照识别时的记录信息；手工录入为 null */
  recognition: DraftRecognition | null;
  /** 立直是识别里宝后系统替用户勾上的：确认态给这个旗标打记号，让「为什么亮着」看得见 */
  riichiAuto: boolean;
  /** 用户在确认态点过「改牌」：此后一直留在编辑态，直到下一次识别 */
  editing: boolean;
}

export function emptyHand(tsumo: boolean): HandInput {
  return {
    closed: [],
    melds: [],
    winTile: 0,
    tsumo,
    doraIndicators: [],
    uraIndicators: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    afterKan: false,
    lastTile: false,
    firstTake: false,
  };
}

/** 暗牌容量：14 减去副露折算的 3 张/组。 */
export function closedCapacity(hand: Pick<HandInput, "melds">): number {
  return 14 - hand.melds.length * 3;
}

/** 手牌是否录满且已指定和张（可以送引擎评估）。 */
export function isHandComplete(hand: HandInput): boolean {
  return hand.closed.length === closedCapacity(hand) && hand.winTile > 0;
}

export function createValueDraft(tsumo: boolean): ValueDraft {
  return {
    mode: "manual",
    han: 3,
    fu: 40,
    yakuman: 0,
    hand: emptyHand(tsumo),
    evaluated: null,
    recognition: null,
    riichiAuto: false,
    editing: false,
  };
}

/**
 * 能不能收起键盘只看结果：来自识别、牌面录满、没有 blocking 提示，且用户没主动点过「改牌」。
 * 宝牌指示牌为空不拦（用户拍板），确认态会把那一栏留空位提醒。
 */
export function confirmable(draft: ValueDraft): boolean {
  if (draft.mode !== "hand" || draft.editing) return false;
  const rec = draft.recognition;
  if (!rec || rec.warnings.some((w) => w.severity === "blocking")) return false;
  return isHandComplete(draft.hand);
}

/** 草稿 → 可计算的番符值；牌面未评估或非和牌形时为 null。 */
export function draftValue(draft: ValueDraft): HandValue | null {
  if (draft.mode === "manual") return { han: draft.han, fu: draft.fu, yakuman: draft.yakuman };
  const e = draft.evaluated;
  return e && e.isAgari ? { han: e.han, fu: e.fu, yakuman: e.yakuman } : null;
}

export function draftToClientValue(draft: ValueDraft): ClientWinValue {
  if (draft.mode === "manual") {
    return { kind: "manual", han: draft.han, fu: draft.fu, yakuman: draft.yakuman };
  }
  return { kind: "hand", hand: draft.hand };
}
