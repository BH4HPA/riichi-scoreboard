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

/** 大厅命令。`sit` 的玩家信息与 `syncProfile` 由服务端按 token 填充，客户端不能自报。 */
export type LobbyCommand =
  | { type: "setRules"; rules: RoomRules }
  | { type: "sit"; seat: Seat; player: PlayerRef }
  | { type: "leave"; seat: Seat }
  | { type: "setReady"; seat: Seat; ready: boolean }
  | { type: "syncProfile"; seat: Seat; player: PlayerRef }
  | { type: "start"; force: boolean }
  | { type: "toLobby" };

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

/** 客户端可提交的命令形态：牌面未评估；入座不带玩家对象。 */
export type ClientCommand =
  | Exclude<LobbyCommand, { type: "sit" } | { type: "syncProfile" }>
  | { type: "sit"; seat: Seat }
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
