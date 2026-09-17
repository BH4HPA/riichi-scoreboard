import type { Seat } from "@riichi/core";
import { withRiichi } from "./hand/handEdits";
import type { ValueDraft } from "./valueDraft";

/*
 * 「立直情况」里和牌者那一格与其手牌的立直旗标是同一件事，只显示一份：和牌者以手牌为准
 * （牌面页手点、识别到里宝自动勾都会反映上来），其余座位用表单自己存的勾选。
 * 表单只在用户亲手点某一格时才改存值，于是「存值 ≠ 手牌」就说明这份立直来自牌面侧。
 */

export function effectiveRiichi(
  stored: readonly boolean[],
  wins: readonly { winner: Seat; draft: ValueDraft }[],
): boolean[] {
  return stored.map((r, s) => wins.find((w) => w.winner === s)?.draft.hand.riichi ?? r);
}

/** 用户点了立直情况：只有被点的那一格写进存值，没动的格子保持原存值（和牌者那格的显示来自手牌）。 */
export function storeRiichiClick(
  stored: readonly boolean[],
  shown: readonly boolean[],
  next: readonly boolean[],
): boolean[] {
  return next.map((v, s) => (v === shown[s] ? stored[s]! : v));
}

/** 让草稿跟随立直情况里的勾选；未变化时原样返回。取消时连带清掉「识别替你勾的」记号。 */
export function draftWithRiichi(draft: ValueDraft, on: boolean): ValueDraft {
  if (draft.hand.riichi === on) return draft;
  return {
    ...draft,
    hand: withRiichi(draft.hand, on),
    riichiAuto: on && draft.riichiAuto,
  };
}

/**
 * 换和牌者：立直若来自牌面侧（手点旗标、识别到里宝），它是这手牌的事实，跟着牌走，里宝不丢；
 * 若是在立直情况里勾的，它是座位的事实，留在原座位，手牌改取新和牌者那一格。
 */
export function draftForWinner(
  draft: ValueDraft,
  stored: readonly boolean[],
  from: Seat,
  to: Seat,
): ValueDraft {
  return draft.hand.riichi !== stored[from] ? draft : draftWithRiichi(draft, stored[to]!);
}
