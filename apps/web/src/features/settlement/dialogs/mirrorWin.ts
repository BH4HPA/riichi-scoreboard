import type { Seat, SettlementWinView } from "@riichi/core";
import type { ValueDraft } from "../valueDraft";

/** 镜像用的和牌者视图：牌面模式且已算出结果时才带手牌（半手牌会被服务端拒绝）。 */
export function mirrorWin(
  winner: Seat,
  draft: ValueDraft,
  valueText: string | null,
): SettlementWinView {
  const evaluated = draft.mode === "hand" ? draft.evaluated : null;
  return {
    winner,
    valueText,
    hand: evaluated ? draft.hand : null,
    evaluated,
  };
}
