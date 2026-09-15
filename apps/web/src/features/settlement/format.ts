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

export function seatOptions(names: string[], exclude: Seat[] = []) {
  return SEATS.map((s) => ({ value: String(s), label: names[s]!, disabled: exclude.includes(s) }));
}
