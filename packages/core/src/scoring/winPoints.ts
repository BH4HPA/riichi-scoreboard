import type { RoomRules } from "../types/rules";
import type { Seat } from "../types/tiles";
import {
  calcBasePoints,
  effectiveYakuman,
  scoreTier,
  TIER_LABELS,
  yakumanLabel,
  type HandValue,
} from "./basePoints";
import { ronPayment, tsumoPayment } from "./payments";

export interface WinSituation {
  /** 和牌者是庄家 */
  dealer: boolean;
  tsumo: boolean;
  honba: number;
}

interface WinPointsBase {
  /** 档位文案：满贯 / 两倍役满…；普通点数为空串 */
  label: string;
  /** 其中本场棒收入 */
  honba: number;
  /** 和牌者总收入（不含供托） */
  total: number;
}

export type WinPoints =
  | (WinPointsBase & { kind: "ron" })
  | (WinPointsBase & {
      kind: "tsumo";
      /** 闲家每家支付 */
      fromNonDealer: number;
      /** 庄家支付；庄家自摸时为 null（每家同额） */
      fromDealer: number | null;
    });

/** 算点数用的固定座位：庄家坐东（0）；闲家和牌时坐南，荣和对象取西 */
const DEALER: Seat = 0;

/**
 * 一手和牌不计供托的点数（含本场）。房间外（拍照算点数）用：没有四家点数，只要「谁付多少」。
 * 不用 `pointsFromBase`（番符表那份不含本场）：本场摊派与取整以 `ronPayment`/`tsumoPayment` 为准，
 * 借固定座位调用，保证与牌局结算只有一套支付规则。
 */
export function winPoints(value: HandValue, situation: WinSituation, rules: RoomRules): WinPoints {
  const base = calcBasePoints(value, rules);
  const yakuman = effectiveYakuman(value, rules);
  const label = yakuman > 0 ? yakumanLabel(yakuman) : TIER_LABELS[scoreTier(value, rules)];
  const winner: Seat = situation.dealer ? DEALER : 1;
  const common = { winner, dealer: DEALER, base, honba: situation.honba, kyotaku: 0, riichi: [] };

  if (!situation.tsumo) {
    const pay = ronPayment({ ...common, loser: 2, collectsSticks: true }, rules);
    return { kind: "ron", label, honba: pay.honbaIncome, total: pay.deltas[winner]! };
  }
  const pay = tsumoPayment(common, rules);
  const amountOf = (seat: Seat) => pay.payers.find((p) => p.seat === seat)!.amount;
  return {
    kind: "tsumo",
    label,
    honba: pay.honbaIncome,
    total: pay.deltas[winner]!,
    fromNonDealer: amountOf(situation.dealer ? 1 : 2),
    fromDealer: situation.dealer ? null : amountOf(DEALER),
  };
}
