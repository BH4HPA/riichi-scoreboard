import type { Seat } from "@riichi/core";
import { withRiichi } from "./hand/handEdits";
import type { ValueDraft } from "./valueDraft";

/**
 * 「立直情况」里和牌者那一格与其手牌的立直旗标是同一件事，只存一份：和牌者以手牌为准
 * （牌面页手点、识别到里宝自动勾都会反映上来），其余座位用表单自己存的勾选。
 */
export function effectiveRiichi(
  stored: readonly boolean[],
  wins: readonly { winner: Seat; draft: ValueDraft }[],
): boolean[] {
  return stored.map((r, s) => wins.find((w) => w.winner === s)?.draft.hand.riichi ?? r);
}

/** 让草稿跟随立直情况里的勾选；未变化时原样返回，不打断正在进行的评估。 */
export function draftWithRiichi(draft: ValueDraft, on: boolean): ValueDraft {
  return draft.hand.riichi === on ? draft : { ...draft, hand: withRiichi(draft.hand, on) };
}
