import type { GameState } from "@riichi/core";

/**
 * 结算草稿所属的局面：同一场、同一局、同一本场、同样的历史。别人记了一笔、撤销、调整场况都会改变它；
 * 立直声明不在其中（声明不该让正在录入的结算作废）。
 */
export function draftStamp(gameNo: number, game: GameState): string {
  const top = game.history[0]?.seq ?? 0;
  return `${gameNo}:${game.kyoku}:${game.honba}:${game.status}:${game.history.length}:${top}`;
}
