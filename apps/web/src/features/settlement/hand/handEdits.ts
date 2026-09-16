import type { HandInput, Tile } from "@riichi/core";
import type { TileLoc } from "@/features/hand/tileLoc";

/** 取出某个位置当前是哪张牌。 */
export function tileAt(hand: HandInput, loc: TileLoc): Tile | null {
  if (loc.area === "closed") return hand.closed[loc.i] ?? null;
  if (loc.area === "meld") return hand.melds[loc.i]?.tiles[loc.j ?? 0] ?? null;
  const row = loc.area === "dora" ? hand.doraIndicators : hand.uraIndicators;
  return row[loc.i] ?? null;
}

/**
 * 把某个位置换成另一张牌。张数不变，所以其它位置的下标与「请核对」记号都不受影响
 * —— 确认态下删除才是错的默认动作（张数已经对了，删一张就不完整）。
 */
export function replaceAt(hand: HandInput, loc: TileLoc, tile: Tile): HandInput {
  switch (loc.area) {
    case "closed": {
      const closed = hand.closed.map((t, k) => (k === loc.i ? tile : t));
      // 和张只记牌不记位置，展示上取同码的最后一张。所以换掉的是「最后那张」时和张才跟着变，
      // 换掉前面的同码牌不动它；末了再兜一次底，保证 winTile 一定还在手里。
      const wasWin = loc.i === hand.closed.lastIndexOf(hand.winTile);
      const winTile = wasWin ? tile : hand.winTile;
      return { ...hand, closed, winTile: closed.includes(winTile) ? winTile : tile };
    }
    case "meld":
      return {
        ...hand,
        melds: hand.melds.map((m, k) =>
          k === loc.i ? { ...m, tiles: m.tiles.map((t, j) => (j === loc.j ? tile : t)) } : m,
        ),
      };
    case "dora":
      return {
        ...hand,
        doraIndicators: hand.doraIndicators.map((t, k) => (k === loc.i ? tile : t)),
      };
    case "ura":
      return {
        ...hand,
        uraIndicators: hand.uraIndicators.map((t, k) => (k === loc.i ? tile : t)),
      };
  }
}

/**
 * 把和张改指到暗牌的某一格。牌面模型只记和张是哪张牌、不记是第几张，
 * 所以同码多张时展示上仍按最后一张标记 —— 与番符计算无关。
 */
export function withWinTile(hand: HandInput, index: number): HandInput {
  const tile = hand.closed[index];
  return tile === undefined ? hand : { ...hand, winTile: tile };
}
