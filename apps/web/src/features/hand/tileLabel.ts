import { isHonor, tileNumber, tileSuit, type Tile } from "@riichi/core";

const HONORS = ["東", "南", "西", "北", "白", "發", "中"];
const SUIT_LABEL = { m: "萬", p: "筒", s: "索", z: "" } as const;

/** 牌的中文名（无障碍标签与文字场景用）。 */
export function tileLabel(tile: Tile): string {
  if (isHonor(tile)) return HONORS[tile - 28]!;
  return `${tileNumber(tile)}${SUIT_LABEL[tileSuit(tile)]}`;
}
