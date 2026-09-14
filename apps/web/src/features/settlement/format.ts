import {
  formatPoints,
  isHonor,
  SEATS,
  tileNumber,
  tileSuit,
  type Seat,
  type Tile,
} from "@riichi/core";

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

const HONORS = ["東", "南", "西", "北", "白", "發", "中"];
const SUIT_LABEL = { m: "萬", p: "筒", s: "索", z: "" } as const;

export function tileLabel(tile: Tile): string {
  if (isHonor(tile)) return HONORS[tile - 28]!;
  return `${tileNumber(tile)}${SUIT_LABEL[tileSuit(tile)]}`;
}
