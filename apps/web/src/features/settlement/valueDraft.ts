import type { ClientWinValue, EvaluatedHand, HandInput, HandValue } from "@riichi/core";

export interface ValueDraft {
  mode: "manual" | "hand";
  han: number;
  fu: number;
  yakuman: number;
  hand: HandInput;
  evaluated: EvaluatedHand | null;
}

export function emptyHand(tsumo: boolean): HandInput {
  return {
    closed: [],
    melds: [],
    winTile: 0,
    tsumo,
    doraIndicators: [],
    uraIndicators: [],
    aka: 0,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    afterKan: false,
    lastTile: false,
    firstTake: false,
  };
}

export function createValueDraft(tsumo: boolean): ValueDraft {
  return { mode: "manual", han: 3, fu: 40, yakuman: 0, hand: emptyHand(tsumo), evaluated: null };
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
