import type { Tile } from "@riichi/core";
import { tileAssetName } from "./tileLabel";

const ASSETS = import.meta.glob("../../assets/tiles/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** 牌图的地址（扁平风格 SVG，见 NOTICE.md） */
export function tileUrl(tile: Tile): string {
  return ASSETS[`../../assets/tiles/${tileAssetName(tile)}.svg`] ?? "";
}
