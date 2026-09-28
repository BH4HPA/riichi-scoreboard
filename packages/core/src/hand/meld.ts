import { baseTile, isHonor, tileSuit, type Tile } from "../types/tiles";

/**
 * 牌面上是不是一组合法的副露：同一张牌的刻子 / 杠子，或同花色数牌的三连（赤五按普通五看，与摆放顺序无关）。
 *
 * riichi-rs 对副露的检查只比「按给出的顺序逐张 +1」、不看花色，不通过的那组会被**静默并进暗牌**
 * （整手按门清算：多出门前清自摸和等），字牌「顺子」则直接让引擎 panic。所以合法性由我们在边界上判，
 * 识别布局与引擎输入共用这一份规则。
 */
export function isLegalMeld(tiles: readonly Tile[]): boolean {
  if (tiles.length !== 3 && tiles.length !== 4) return false;
  const bases = tiles.map(baseTile).sort((a, b) => a - b);
  if (bases.every((b) => b === bases[0])) return true;
  if (bases.length !== 3 || isHonor(bases[0]!)) return false;
  return (
    tileSuit(bases[0]!) === tileSuit(bases[2]!) &&
    bases[1] === bases[0]! + 1 &&
    bases[2] === bases[0]! + 2
  );
}
