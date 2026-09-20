import { DomainError } from "../types/errors";
import type { RoomState } from "../types/state";
import type { Seat } from "../types/tiles";
import { handContextAt, type HandContext } from "./options";

/**
 * 《天》二人麻将的和牌场况：场风固定东，自风只有庄家东 / 闲家西。
 * 借四人座位表达：庄家坐 0（东），闲家坐 2（西）——`handContextAt` 会把二人房的 1 号位算成南。
 */
export function tenHandContext(isDealer: boolean): HandContext {
  return { seat: isDealer ? 0 : 2, dealer: 0, roundWind: 0 };
}

/** 房间里某座位和牌的场况：服务端评估手牌的唯一入口（结算命令与预览共用）。 */
export function roomHandContext(room: RoomState, seat: Seat): HandContext {
  if (!room.game) throw new DomainError("no_game", "尚未开局");
  if (room.kind === "ten") return tenHandContext(room.game.present.dealer === seat);
  return handContextAt(room.game.present.kyoku, seat);
}
