import type { RoomRules } from "./rules";
import type { TenDrawReason } from "../ten/state";
import type { AbortiveReason, HandInput, PlayerRef, WinValue } from "./state";
import type { Seat, Tile } from "./tiles";

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
  /**
   * `resetReady` 只由服务端补全：规则确有变化时清掉设备玩家的准备（「已准备」不能沿用到新规则）。
   * 旧事件没有这个字段，回放语义不变。
   */
  | { type: "setRules"; rules: RoomRules; resetReady?: true }
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
  /**
   * 声明立直：只记本局状态供结算预勾，不扣点、不入撤销栈。
   * 带上按下时看到的局面（局、本场、历史条数）：不看 baseSeq，但局面对不上就拒绝，不会落到别的局上。
   */
  | { type: "declareRiichi"; seat: Seat; kyoku: number; honba: number; entries: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "endGame" }
  | { type: "newGame" };

/**
 * 《天》二人麻将的对局命令（见 `ten/reduce.ts`）。撤销 / 重做 / 终局 / 重开沿用 `GameCommand` 里的同名命令。
 * 宣言与指定也进撤销栈；和牌者恒为进攻方，所以 `tenTsumo` 不带座位。
 */
export type TenCommand<V = WinValue> =
  /** 仅 Stage A。立直扣 1 根立直棒；`entries` = 按下时看到的历史条数，对不上即拒绝（不看 baseSeq） */
  | { type: "tenDeclare"; seat: Seat; riichi: boolean; entries: number }
  /** 仅 Stage B：防守方本轮指定的两张（基础牌码 1–34） */
  | { type: "tenGuess"; tiles: [Tile, Tile] }
  | { type: "tenDraw"; reason: TenDrawReason }
  | { type: "tenTsumo"; value: V };

export type Command = LobbyCommand | GameCommand | TenCommand;

/** 客户端可提交的命令形态：牌面未评估；入座不带玩家对象；本地玩家只带 id；改规则不带准备重置标记。 */
export type ClientCommand =
  | Exclude<LobbyCommand, { type: "sit" } | { type: "syncProfile" } | { type: "setRules" }>
  | { type: "setRules"; rules: RoomRules }
  | { type: "sit"; seat: Seat }
  | { type: "sitLocal"; seat: Seat; playerId: string }
  | GameCommand<ClientWinValue>
  | TenCommand<ClientWinValue>;

const TEN_COMMAND_TYPES: ReadonlySet<string> = new Set([
  "tenDeclare",
  "tenGuess",
  "tenDraw",
  "tenTsumo",
]);

export function isTenCommand(cmd: { type: string }): cmd is TenCommand {
  return TEN_COMMAND_TYPES.has(cmd.type);
}

export const GAME_COMMAND_TYPES: ReadonlySet<string> = new Set([
  "tsumo",
  "ron",
  "draw",
  "abortive",
  "chombo",
  "adjust",
  "declareRiichi",
  "undo",
  "redo",
  "endGame",
  "newGame",
]);

/** 对局命令（两种房型的都算）：不是它的就是大厅命令 */
export function isGameCommand(cmd: { type: string }): cmd is GameCommand | TenCommand {
  return GAME_COMMAND_TYPES.has(cmd.type) || TEN_COMMAND_TYPES.has(cmd.type);
}
