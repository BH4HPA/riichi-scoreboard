import type { Meld } from "@riichi/core";

/** 暗杠：不开门的 4 张（吃碰与明杠都是 open） */
export function isAnkan(meld: Meld): boolean {
  return !meld.open && meld.tiles.length === 4;
}

/**
 * 这一张是不是暗杠扣着的那两张之一。牌面在界面上看不见，所以它既不该可点
 * （点了没有视觉反馈，改动却是真的：赤五会被藏进牌背，看不见又占着赤五名额），
 * 也不该打「请核对」记号。
 */
export function isAnkanBack(meld: Meld, j: number): boolean {
  return isAnkan(meld) && (j === 0 || j === meld.tiles.length - 1);
}
