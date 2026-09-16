/**
 * 手牌里的一个位置。识别结果的「没把握」标记、确认态的点牌替换都用它寻址。
 * 索引按 `HandInput` 的原始下标，不是排序后的渲染序（`HandStrip` 会重排，回调时负责还原）。
 */
export type TileArea = "closed" | "meld" | "dora" | "ura";

export interface TileLoc {
  area: TileArea;
  /** closed/dora/ura 为牌的下标；meld 为副露组的下标 */
  i: number;
  /** 仅 meld：组内牌的下标 */
  j?: number;
}

export function locKey(loc: TileLoc): string {
  return loc.area === "meld" ? `meld:${loc.i}:${loc.j}` : `${loc.area}:${loc.i}`;
}

export function hasLoc(locs: readonly TileLoc[], loc: TileLoc): boolean {
  const key = locKey(loc);
  return locs.some((l) => locKey(l) === key);
}

export function withoutLoc(locs: readonly TileLoc[], loc: TileLoc): TileLoc[] {
  const key = locKey(loc);
  return locs.filter((l) => locKey(l) !== key);
}
