import type { GameState, RoomView, TenGameState } from "@riichi/core";

/**
 * 结算草稿所属的局面：同一场、同一局、同一本场、同样的历史。别人记了一笔、撤销、调整场况都会改变它；
 * 立直声明不在其中（声明不该让正在录入的结算作废）。
 */
export function draftStamp(gameNo: number, game: GameState): string {
  const top = game.history[0]?.seq ?? 0;
  return `${gameNo}:${game.kyoku}:${game.honba}:${game.status}:${game.history.length}:${top}`;
}

/**
 * 二人房：同一场、同一阶段、同样的历史。防守方逐轮指定不在其中——
 * 进攻方录手牌时对方还在指定，不该每指定一轮就把弹窗关掉。
 */
export function tenDraftStamp(gameNo: number, game: TenGameState): string {
  const top = game.history[0]?.seq ?? 0;
  return `${gameNo}:${game.status}:${game.stage.kind}:${game.history.length}:${top}`;
}

/** 当前房间的草稿局面戳；未开局为 null。 */
export function roomDraftStamp(room: RoomView): string | null {
  if (!room.game) return null;
  return room.kind === "ten"
    ? tenDraftStamp(room.gameNo, room.game.present)
    : draftStamp(room.gameNo, room.game.present);
}
