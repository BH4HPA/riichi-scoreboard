import type { RoomRules } from "./rules";
import type { AbortiveReason, HandInput, PlayerRef, WinValue } from "./state";
import type { Seat } from "./tiles";

/** 客户端提交的和牌价值：牌面形态尚未评估，由服务端补上 result 后变为 WinValue。 */
export type ClientWinValue =
  { kind: "manual"; han: number; fu: number; yakuman: number } | { kind: "hand"; hand: HandInput };

export interface RonWin<V> {
  winner: Seat;
  value: V;
  pao?: Seat;
}

/**
 * 大厅命令。`sit` 的玩家信息与 `ready`、`syncProfile` 由服务端填充，客户端不能自报：
 * 设备玩家按 token 入座（未准备），本地玩家由主控台 `sitLocal` 入座（即已准备）。
 *
 * 权限边界（房间内人人都是管理员，服务端不区分主控台与手机）：
 * - 设备玩家的座位（sit/leave/setReady）只能本人操作；本地玩家的座位任何人可操作；
 * - 规则、开局、结算、撤销、终局、解散：任何连接者都可发起。
 */
export type LobbyCommand =
  | { type: "setRules"; rules: RoomRules }
  | { type: "sit"; seat: Seat; player: PlayerRef; ready?: boolean }
  | { type: "leave"; seat: Seat }
  | { type: "setReady"; seat: Seat; ready: boolean }
  | { type: "syncProfile"; seat: Seat; player: PlayerRef }
  | { type: "start"; force: boolean }
  | { type: "toLobby" }
  /** 解散房间：任何阶段可用，之后房间只读 */
  | { type: "dissolve" };

export type GameCommand<V = WinValue> =
  | { type: "tsumo"; winner: Seat; value: V; riichi: Seat[]; pao?: Seat; endGame?: boolean }
  | { type: "ron"; loser: Seat; wins: RonWin<V>[]; riichi: Seat[]; endGame?: boolean }
  | { type: "draw"; tenpai: boolean[]; riichi: Seat[]; nagashi: Seat[]; endGame?: boolean }
  | { type: "abortive"; reason: AbortiveReason; riichi: Seat[] }
  | { type: "chombo"; offender: Seat }
  | { type: "adjust"; kyoku: number; honba: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "endGame" }
  | { type: "newGame" };

export type Command = LobbyCommand | GameCommand;

/** 客户端可提交的命令形态：牌面未评估；入座不带玩家对象；本地玩家只带 id。 */
export type ClientCommand =
  | Exclude<LobbyCommand, { type: "sit" } | { type: "syncProfile" }>
  | { type: "sit"; seat: Seat }
  | { type: "sitLocal"; seat: Seat; playerId: string }
  | GameCommand<ClientWinValue>;

export const GAME_COMMAND_TYPES: ReadonlySet<string> = new Set([
  "tsumo",
  "ron",
  "draw",
  "abortive",
  "chombo",
  "adjust",
  "undo",
  "redo",
  "endGame",
  "newGame",
]);

export function isGameCommand(cmd: { type: string }): cmd is GameCommand {
  return GAME_COMMAND_TYPES.has(cmd.type);
}
