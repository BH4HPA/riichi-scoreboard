import { isAka, isHonor, tileNumber, tileSuit, type Tile } from "@riichi/core";

const HONORS = ["東", "南", "西", "北", "白", "發", "中"];
const SUIT_LABEL = { m: "萬", p: "筒", s: "索", z: "" } as const;

/** 牌的中文名（无障碍标签与文字场景用）；赤五为「赤5萬」。 */
export function tileLabel(tile: Tile): string {
  if (isHonor(tile)) return HONORS[tile - 28]!;
  return `${isAka(tile) ? "赤" : ""}${tileNumber(tile)}${SUIT_LABEL[tileSuit(tile)]}`;
}

/** 牌图文件名（mahjong_graphic 命名）：1m..9m / 1z..7z / 0m 0p 0s。 */
export function tileAssetName(tile: Tile): string {
  if (isHonor(tile)) return `${tile - 27}z`;
  return `${isAka(tile) ? 0 : tileNumber(tile)}${tileSuit(tile)}`;
}
