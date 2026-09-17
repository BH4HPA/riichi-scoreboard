import type { ClientWinValue, EvaluatedHand, HandInput, HandValue, Tile } from "@riichi/core";
import type { DraftRecognition } from "@/features/recognition/applyRecognized";

export interface ValueDraft {
  mode: "manual" | "hand";
  /** 手填番符：null = 还没选（不给默认值，没选齐不能确认） */
  han: number | null;
  fu: number | null;
  yakuman: number;
  hand: HandInput;
  evaluated: EvaluatedHand | null;
  /** 牌面来自拍照识别时的记录信息；手工录入为 null */
  recognition: DraftRecognition | null;
  /** 立直是识别里宝后系统替用户勾上的：确认态给这个旗标打记号，让「为什么亮着」看得见 */
  riichiAuto: boolean;
  /** 用户在确认态点过「改牌」：此后一直留在编辑态，直到下一次识别 */
  editing: boolean;
  /** 取消立直时暂存的里宝指示牌：重新勾上立直就还原，误点一下不丢识别结果 */
  uraStash: Tile[];
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

export function createValueDraft(tsumo: boolean, mode: ValueDraft["mode"]): ValueDraft {
  return {
    mode,
    han: null,
    fu: null,
    yakuman: 0,
    hand: emptyHand(tsumo),
    evaluated: null,
    recognition: null,
    riichiAuto: false,
    editing: false,
    uraStash: [],
  };
}

/**
 * 手牌编辑落到草稿的唯一入口：取消立直时（`withRiichi` 会清空里宝）把里宝暂存，
 * 重新勾上且里宝为空时还原，张数不超过当前宝牌指示牌。
 */
export function withHandEdit(draft: ValueDraft, hand: HandInput): ValueDraft {
  const prev = draft.hand;
  if (prev.riichi && !hand.riichi && prev.uraIndicators.length > 0) {
    return { ...draft, hand, uraStash: prev.uraIndicators };
  }
  if (!prev.riichi && hand.riichi && hand.uraIndicators.length === 0 && draft.uraStash.length) {
    const uraIndicators = draft.uraStash.slice(0, hand.doraIndicators.length);
    return { ...draft, hand: { ...hand, uraIndicators }, uraStash: [] };
  }
  return { ...draft, hand };
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

/** 手填模式的番符值；役满不看番符，否则番、符都选了才算数。 */
function manualValue(draft: ValueDraft): HandValue | null {
  if (draft.yakuman > 0) return { han: draft.han ?? 0, fu: draft.fu ?? 0, yakuman: draft.yakuman };
  if (draft.han === null || draft.fu === null) return null;
  return { han: draft.han, fu: draft.fu, yakuman: 0 };
}

/** 还没填的价值项（底栏「还需选择」用）；填齐了为空。 */
export function missingValue(draft: ValueDraft): string[] {
  if (draft.mode === "hand") return draftValue(draft) ? [] : ["牌面"];
  if (draft.yakuman > 0) return [];
  return [draft.han === null && "番", draft.fu === null && "符"].filter((x) => x !== false);
}

/** 草稿 → 可计算的番符值；手填未选齐、牌面未评估或非和牌形时为 null。 */
export function draftValue(draft: ValueDraft): HandValue | null {
  if (draft.mode === "manual") return manualValue(draft);
  const e = draft.evaluated;
  return e && e.isAgari ? { han: e.han, fu: e.fu, yakuman: e.yakuman } : null;
}

/** 只在 `draftValue` 非空（可以确认）时调用。 */
export function draftToClientValue(draft: ValueDraft): ClientWinValue {
  if (draft.mode === "manual") {
    const v = manualValue(draft)!;
    return { kind: "manual", han: v.han, fu: v.fu, yakuman: v.yakuman };
  }
  return { kind: "hand", hand: draft.hand };
}
