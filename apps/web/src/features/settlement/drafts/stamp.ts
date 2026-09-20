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
 * 二人房：同一场、同样的历史、同一次宣言。宣言是可撤销的步骤，同一局里 Stage B 可能出现不止一次
 * （撤销后换人宣言、立直改成听牌宣言），所以「这次宣言是谁、是什么」也在戳里——不然旧草稿会带着另一次宣言的
 * 立直与手牌被沿用。防守方逐轮指定不在其中：进攻方录手牌时对方还在指定，不该每指定一轮就把弹窗关掉。
 */
export function tenDraftStamp(gameNo: number, game: TenGameState): string {
  const top = game.history[0]?.seq ?? 0;
  const { stage } = game;
  const declared = stage.kind === "B" ? `B${stage.attacker}${stage.riichi ? "r" : "t"}` : "A";
  return `${gameNo}:${game.status}:${declared}:${game.history.length}:${top}`;
}

/** 当前房间的草稿局面戳；未开局为 null。 */
export function roomDraftStamp(room: RoomView): string | null {
  if (!room.game) return null;
  return room.kind === "ten"
    ? tenDraftStamp(room.gameNo, room.game.present)
    : draftStamp(room.gameNo, room.game.present);
}
