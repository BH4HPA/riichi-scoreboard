import { formatPoints, SEATS, type Seat } from "@riichi/core";

export const seatsOf = (flags: readonly boolean[]): Seat[] => SEATS.filter((s) => flags[s]);

export function incomeBreakdown(parts: {
  base: number;
  honba: number;
  kyotaku: number;
  riichi: number;
}): string {
  return `得分 ${formatPoints(parts.base)} 点、本场棒 ${formatPoints(parts.honba)} 点、历史立直供托 ${formatPoints(parts.kyotaku)} 点、本局立直供托 ${formatPoints(parts.riichi)} 点`;
}

export function drawKyotakuText(before: number, after: number): string {
  return `历史立直供托 ${formatPoints(before * 1000)} 点，本局后共 ${formatPoints(after * 1000)} 点`;
}

export const NO_FLAGS = [false, false, false, false];

/** 座位固定东南西北逆时针坐，出牌顺序 +1 即下家。 */
const RELATIVE_LABELS = ["自己", "下家", "对家", "上家"] as const;

/** 以操作者座位为视角的相对方位；不在座（主控台、未入座的手机）时为 null。 */
export function relativeSeatLabel(me: Seat | null, seat: Seat): string | null {
  return me === null ? null : RELATIVE_LABELS[(seat - me + 4) % 4]!;
}
