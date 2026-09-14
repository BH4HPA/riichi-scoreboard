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

export type LobbyCommand =
  | { type: "setRules"; rules: RoomRules }
  | { type: "sit"; seat: Seat; player: PlayerRef }
  | { type: "leave"; seat: Seat }
  | { type: "setReady"; seat: Seat; ready: boolean }
  | { type: "setPlayerName"; seat: Seat; name: string }
  | { type: "setPlayerAvatar"; seat: Seat; avatar: string | null }
  | { type: "start"; force: boolean }
  | { type: "toLobby" };

export type GameCommand<V = WinValue> =
  | { type: "tsumo"; winner: Seat; value: V; riichi: Seat[]; pao?: Seat; endGame?: boolean }
  | { type: "ron"; loser: Seat; wins: RonWin<V>[]; riichi: Seat[]; endGame?: boolean }
  | { type: "draw"; tenpai: boolean[]; riichi: Seat[]; nagashi: Seat[]; endGame?: boolean }
  | { type: "abortive"; reason: AbortiveReason; riichi: Seat[] }
  | { type: "chombo"; offender: Seat }
  | { type: "adjust"; kyoku: number; honba: number; dealer: Seat }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "endGame" }
  | { type: "newGame" };

export type Command = LobbyCommand | GameCommand;
/** 客户端提交形态（牌面未评估） */
export type ClientCommand = LobbyCommand | GameCommand<ClientWinValue>;

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

export function isGameCommand(cmd: Command): cmd is GameCommand {
  return GAME_COMMAND_TYPES.has(cmd.type);
}
