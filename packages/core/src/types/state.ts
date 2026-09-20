import type { FinalResult, TobiRecord } from "../final/settle";
import type { HandValue, ScoreTier } from "../scoring/basePoints";
import type { WinPayment } from "../scoring/payments";
import type { TenGameState } from "../ten/state";
import type { RoomRules } from "./rules";
import type { Meld, Seat, Tile } from "./tiles";

export type PlayerKind = "device" | "local";

/** 座位上的玩家快照。kind 随事件落库，座位权限只看快照、不回查玩家表。 */
export interface PlayerRef {
  id: string;
  name: string;
  avatar: string | null;
  /** device = 手机登录的设备玩家；local = 主控台创建的本地玩家。旧事件缺省视为 device */
  kind?: PlayerKind;
}

export function isLocalPlayer(p: PlayerRef | null | undefined): boolean {
  return p?.kind === "local";
}

/** 牌面输入（牌键盘或拍照识别产出）。赤五直接以 35/36/37 出现在牌列表中。 */
export interface HandInput {
  closed: Tile[];
  melds: Meld[];
  /** 和张，包含在 closed 里（精确码，赤五即 35/36/37） */
  winTile: Tile;
  tsumo: boolean;
  /** 宝牌指示牌（含杠宝） */
  doraIndicators: Tile[];
  /** 里宝指示牌（仅立直时有效） */
  uraIndicators: Tile[];
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  /** 岭上开花（自摸）/ 抢杠（荣和） */
  afterKan: boolean;
  /** 海底/河底 */
  lastTile: boolean;
  /** 天和/地和/人和 判定所需：首巡无副露 */
  firstTake: boolean;
}

export interface EvaluatedHand extends HandValue {
  /** riichi-rs 役 id → 番数 */
  yaku: Record<string, number>;
  isAgari: boolean;
  /** 非和牌时的原因：无役 / 不是和牌形 */
  reason?: "noYaku" | "notAgari";
}

export type WinValue =
  | { kind: "manual"; han: number; fu: number; yakuman: number }
  | { kind: "hand"; hand: HandInput; result: EvaluatedHand };

export type AbortiveReason = "kyuushu" | "suufon" | "suucha" | "suukan" | "sanchahou";

export interface WinRecord {
  winner: Seat;
  value: HandValue;
  tier: ScoreTier;
  payment: WinPayment;
  yaku: Record<string, number> | null;
  /** 牌面形态录入时的手牌（历史展示用）；番符快选为 null */
  hand: HandInput | null;
  pao: Seat | null;
}

interface HistoryBase {
  seq: number;
  at: number;
  kyoku: number;
  honba: number;
  dealer: Seat;
  /** 当时四家昵称快照 */
  names: string[];
  deltas: number[];
  riichi: Seat[];
}

export type HistoryEntry = HistoryBase &
  (
    | { kind: "tsumo"; win: WinRecord }
    | { kind: "ron"; loser: Seat; wins: WinRecord[] }
    | { kind: "draw"; tenpai: Seat[]; noten: Seat[]; nagashi: Seat[]; riichiIncome: number }
    | { kind: "abortive"; reason: AbortiveReason }
    | { kind: "chombo"; offender: Seat }
    | { kind: "kyotaku"; to: Seat | null; amount: number }
    | { kind: "adjust"; to: { kyoku: number; honba: number } }
  );

export interface GameState {
  status: "playing" | "finished";
  /** 开局时的四家快照（战绩落库与历史展示以此为准） */
  players: PlayerRef[];
  points: number[];
  kyotaku: number;
  honba: number;
  /**
   * 局序号：0..3 东场、4..7 南场，延长战继续往后（半庄 8..11 西场，东风战 4..7 南场）。
   * 座位固定东南西北，庄家 = kyoku % 4。
   */
  kyoku: number;
  /**
   * 本局已声明立直的座位（`declareRiichi`）：只供结算表单预勾，扣点仍随结算命令的 `riichi` 发生。
   * 声明替换 present 但不入撤销栈；换局清空，所以撤销一笔结算时声明随快照回来。
   */
  riichi: boolean[];
  history: HistoryEntry[];
  tobi: TobiRecord | null;
  startedAt: number;
  finishedAt: number | null;
  final: FinalResult | null;
}

export function dealerOf(kyoku: number): Seat {
  return (kyoku % 4) as Seat;
}

export interface Undoable<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * 房型：房间的身份，建房时定、之后不变（决定座位数与对局模型），所以不放进可在大厅随时修改的 `RoomRules`。
 * yonma = 四人麻将；ten = 《天》规则二人麻将（见 `ten/state.ts`）。旧房间没有这个字段，一律是 yonma。
 */
export type RoomKind = "yonma" | "ten";
export const ROOM_KINDS: readonly RoomKind[] = ["yonma", "ten"];
export const SEAT_COUNT: Record<RoomKind, number> = { yonma: 4, ten: 2 };

export function isRoomKind(value: unknown): value is RoomKind {
  return ROOM_KINDS.includes(value as RoomKind);
}

/** 房间壳：座位、准备、阶段、规则与房型无关，两种房型共用 */
interface RoomShell {
  code: string;
  /** closed = 已解散：任何命令都被拒绝，客户端连接被关闭 */
  phase: "lobby" | "playing" | "finished" | "closed";
  /** 二人房只消费 `scoring` 与 `hand` 两段（算番算点），其余不读 */
  rules: RoomRules;
  seats: (PlayerRef | null)[];
  ready: boolean[];
  /** 本房间第几局（开局/重开一局时递增，用于战绩落库的键） */
  gameNo: number;
}

export interface YonmaRoomState extends RoomShell {
  kind: "yonma";
  game: Undoable<GameState> | null;
}

export interface TenRoomState extends RoomShell {
  kind: "ten";
  game: Undoable<TenGameState> | null;
}

export type RoomState = YonmaRoomState | TenRoomState;

/** 座位的风位标签：四人房东南西北；二人房只有东（起家）与西 */
const SEAT_LABELS: Record<RoomKind, readonly string[]> = {
  yonma: ["东", "南", "西", "北"],
  ten: ["东", "西"],
};

export function seatLabels(kind: RoomKind): readonly string[] {
  return SEAT_LABELS[kind];
}

/** 空座的占位名；`kind` 缺省按四人房（调用方只有座位列表时） */
export function seatNames(room: { kind?: RoomKind; seats: (PlayerRef | null)[] }): string[] {
  const labels = SEAT_LABELS[room.kind ?? "yonma"];
  return room.seats.map((p, i) => p?.name ?? `${labels[i]!}风家`);
}

export function seatOfPlayer(
  seats: readonly (PlayerRef | null)[],
  playerId: string | null,
): Seat | null {
  if (!playerId) return null;
  const idx = seats.findIndex((p) => p?.id === playerId);
  return idx === -1 ? null : (idx as Seat);
}
