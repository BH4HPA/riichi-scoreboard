import { isTrackId } from "../music";
import type { ClientCommand } from "../types/commands";
import { DomainError } from "../types/errors";
import type { EvaluatedHand, HandInput } from "../types/state";
import type { Seat } from "../types/tiles";
import type { UiIntent, UiState } from "./uiIntent";
import type { RoomView } from "./view";

/** 校验客户端发来的立直音乐请求：null = 停止；否则必须是曲目 id 的格式（曲库在静态桶，服务端不持有）。 */
export function validateMusicTrack(input: unknown): string | null {
  if (input === null) return null;
  if (!isTrackId(input)) throw new DomainError("bad_music", "曲目 id 无效");
  return input;
}

export type ClientMessage =
  | { type: "command"; id: string; baseSeq: number; command: ClientCommand }
  | { type: "ui"; intent: UiIntent }
  /** 立直音乐：track 为曲库 id，null 表示停止 */
  | { type: "music"; track: string | null }
  | { type: "evaluate"; id: string; seat: Seat; hand: HandInput }
  | { type: "ping" };

export type ServerMessage =
  | { type: "welcome"; playerId: string }
  | { type: "state"; room: RoomView }
  | { type: "ui"; intents: UiState[] }
  | { type: "ack"; id: string; seq: number }
  | { type: "error"; id: string | null; code: string; message: string }
  | { type: "evaluate"; id: string; result: EvaluatedHand }
  /** 撤销/重做生效后发给全房间：谁撤了（重做了）哪一笔，各端弹一条提示 */
  | { type: "reverted"; op: "undo" | "redo"; by: string; what: string }
  | { type: "pong" };
