import {
  akaLimit,
  allHandTiles,
  isAka,
  sameTile,
  tileSuit,
  type HandInput,
  type RoomRules,
  type Tile,
} from "@riichi/core";
import type { TileLoc } from "@/features/hand/tileLoc";
import { tileAt } from "./handEdits";

/** 除 `excluding` 这一张之外已录入的牌：替换时被换掉的那张不占名额。 */
function otherTiles(hand: HandInput, excluding?: TileLoc): Tile[] {
  const all = allHandTiles(hand);
  const current = excluding ? tileAt(hand, excluding) : null;
  if (current === null) return all;
  const i = all.indexOf(current);
  return i === -1 ? all : [...all.slice(0, i), ...all.slice(i + 1)];
}

/** 同一基础牌（忽略赤标记）已录入的张数。 */
export function countTile(hand: HandInput, tile: Tile, excluding?: TileLoc): number {
  return otherTiles(hand, excluding).filter((t) => sameTile(t, tile)).length;
}

/** 这张赤五还能不能录入：受规则总数与同花色上限约束。 */
export function akaAvailable(
  hand: HandInput,
  tile: Tile,
  rules: RoomRules,
  excluding?: TileLoc,
): boolean {
  if (!isAka(tile)) return true;
  const akas = otherTiles(hand, excluding).filter(isAka);
  if (akas.length >= rules.hand.akaCount) return false;
  const suit = tileSuit(tile) as "m" | "p" | "s";
  return akas.filter((t) => tileSuit(t) === suit).length < akaLimit(suit, rules.hand.akaCount);
}
