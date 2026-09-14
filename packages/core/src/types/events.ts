import type { Command } from "./commands";

export interface EventActor {
  playerId: string | null;
  clientId: string;
}

/** 房间事件：命令 + 信封。reducer 只读信封提供的 seq/at，自身不产生时间与 ID。 */
export interface RoomEvent {
  seq: number;
  at: number;
  actor: EventActor;
  command: Command;
}
