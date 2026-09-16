import { findTrack } from "./music";
import { DomainError } from "./progress/advance";
import { assertSeat, validateHandShape } from "./reducer/validateCommand";
import { YAKU_PAGES } from "./reference/yakuTable";
import type { ClientCommand, Command } from "./types/commands";
import type { RoomRules } from "./types/rules";
import {
  isLocalPlayer,
  type EvaluatedHand,
  type GameState,
  type HandInput,
  type PlayerRef,
  type RoomState,
} from "./types/state";
import type { Seat } from "./types/tiles";

/**
 * WebSocket 保活节奏。线上经腾讯云 CDN 回源，CDN 对约 10 s 无数据的连接会静默回收且不通知两端：
 * 客户端每 pingMs 发一次 ping，staleMs 内没收到任何服务端消息就主动重连；
 * 服务端 serverIdleMs 内没收到任何客户端消息就断开（手机被系统杀掉时不会发 close 帧）。
 */
export const WS_KEEPALIVE = { pingMs: 5_000, staleMs: 8_000, serverIdleMs: 20_000 } as const;

/** 全员准备且在线后自动开局的倒计时 */
export const AUTO_START_MS = 3_000;

/** 广播给客户端的房间视图：不含撤销栈本体，只含深度。 */
export interface GameView {
  present: GameState;
  undoDepth: number;
  redoDepth: number;
}

export interface RoomView {
  code: string;
  seq: number;
  phase: RoomState["phase"];
  rules: RoomRules;
  seats: (PlayerRef | null)[];
  ready: boolean[];
  /** 各座位是否在线：空座 false，本地玩家恒为 true，设备玩家看是否有活动连接 */
  online: boolean[];
  /** 距自动开局的剩余毫秒（广播时刻计）；null 表示未在倒计时。用剩余量而非时刻，手机时钟偏差不影响显示 */
  autoStartIn: number | null;
  /** 电视正在播放的立直音乐；内存态，不进事件表 */
  music: MusicState | null;
  game: GameView | null;
  gameNo: number;
}

/**
 * 谁按下了立直、放哪首：track 为曲库 id；seat 为 null 表示按下者没有座位（主控台代按）。
 * 名字由客户端按座位快照派生，不进协议；at 单调递增，客户端用它区分「同曲重按」。
 */
export interface MusicState {
  track: string;
  seat: Seat | null;
  at: number;
}

/**
 * 提交后应停止立直音乐的命令：这一局结束或对局阶段变化。穷举，新增命令时必须表态。
 * redo 等于再提交一次结算所以停；undo 回到这一局，不停。
 */
export const STOPS_MUSIC: Record<Command["type"], boolean> = {
  tsumo: true,
  ron: true,
  draw: true,
  abortive: true,
  chombo: true,
  adjust: true,
  endGame: true,
  newGame: true,
  toLobby: true,
  start: true,
  dissolve: true,
  setRules: false,
  sit: false,
  leave: false,
  setReady: false,
  syncProfile: false,
  undo: false,
  redo: true,
};

/**
 * baseSeq 落后时仍然执行的命令：目标是绝对的（座位号），含义不依赖发起者当时看到的状态，
 * 权限与可行性由服务端按当前快照再校验一遍（座位为空/已被占用/非本人）。穷举，新增命令时必须表态。
 *
 * 其余命令都必须拒绝：牌局类（结算/撤销/重做/调整/终局）的含义是「对我看到的这一局」，
 * setRules 是整份规则覆盖，落后的提交会盖掉别人刚改的。
 *
 * 为什么需要这张表：房间里任何一个人的操作都会让 seq 前进，广播到别的客户端要几十毫秒；
 * 这段窗口里别人点按钮就会带着旧 seq 到达。座位类操作因此被拒是纯粹的误伤（实测过：
 * 手机重新入座后 26 ms 内主控台点「离座」被拒，只弹提示、座位不动）。
 */
export const TOLERATES_STALE: Record<ClientCommand["type"], boolean> = {
  sit: true,
  sitLocal: true,
  leave: true,
  setReady: true,
  start: true,
  setRules: false,
  toLobby: false,
  dissolve: false,
  tsumo: false,
  ron: false,
  draw: false,
  abortive: false,
  chombo: false,
  adjust: false,
  undo: false,
  redo: false,
  endGame: false,
  newGame: false,
};

/** 校验客户端发来的立直音乐请求：null = 停止；否则必须是曲库里的 id。 */
export function validateMusicTrack(input: unknown): string | null {
  if (input === null) return null;
  if (typeof input !== "string" || !findTrack(input)) {
    throw new DomainError("bad_music", "曲目不存在");
  }
  return input;
}

/** 各座位在线状态（见 RoomView.online）。 */
export function seatsOnline(state: RoomState, onlinePlayerIds: ReadonlySet<string>): boolean[] {
  return state.seats.map((p) => p !== null && (isLocalPlayer(p) || onlinePlayerIds.has(p.id)));
}

/**
 * 是否满足自动开局：大厅、满座、全员已准备、设备玩家全部在线，且至少有一名设备玩家
 * （全是本地玩家时由主控台手动开局）。
 */
export function autoStartEligible(state: RoomState, online: boolean[]): boolean {
  if (state.phase !== "lobby") return false;
  if (state.seats.some((p) => p === null)) return false;
  if (state.ready.some((r) => !r) || online.some((o) => !o)) return false;
  return state.seats.some((p) => p !== null && !isLocalPlayer(p));
}

export function toRoomView(
  state: RoomState,
  seq: number,
  onlinePlayerIds: ReadonlySet<string>,
  autoStartIn: number | null,
  music: MusicState | null,
): RoomView {
  return {
    code: state.code,
    seq,
    phase: state.phase,
    rules: state.rules,
    seats: state.seats,
    ready: state.ready,
    online: seatsOnline(state, onlinePlayerIds),
    autoStartIn,
    music,
    game: state.game
      ? {
          present: state.game.present,
          undoDepth: state.game.past.length,
          redoDepth: state.game.future.length,
        }
      : null,
    gameNo: state.gameNo,
  };
}

/** 结算镜像里的一位和牌者：牌面只在录满并算出结果后才携带。 */
export interface SettlementWinView {
  winner: Seat;
  valueText: string | null;
  hand: HandInput | null;
  evaluated: EvaluatedHand | null;
}

/** 手机端当前打开的界面，供电视镜像。 */
export type UiIntent =
  | { kind: "none" }
  | {
      kind: "settlement";
      mode: "tsumo" | "ron" | "draw" | "abortive" | "chombo";
      deltas: number[] | null;
      summary: string | null;
      loser: Seat | null;
      riichi: Seat[];
      wins: SettlementWinView[];
    }
  | { kind: "reference"; tab: ReferenceTab; sub: string }
  | { kind: "rules" }
  | { kind: "adjust" };

export type ReferenceTab = "yaku" | "points";
/** 番符表二级页：役种页按 YAKU_PAGES.key；点数页为 ko / oya / fu */
export interface ReferenceView {
  tab: ReferenceTab;
  sub: string;
}
export const DEFAULT_REFERENCE_VIEW: ReferenceView = { tab: "yaku", sub: "1" };
export const POINTS_SUBS = ["ko", "oya", "fu"] as const;

/** 服务端主动关闭连接且客户端不应重连的关闭码。 */
export const WS_CLOSE = {
  unauthorized: 4001,
  notFound: 4004,
  dissolved: 4010,
  /** 服务端空闲超时断开；客户端应重连 */
  idle: 4008,
} as const;

const SETTLEMENT_MODES = ["tsumo", "ron", "draw", "abortive", "chombo"] as const;
const REFERENCE_TABS = ["yaku", "points"] as const;
const REFERENCE_SUBS: Record<ReferenceTab, readonly string[]> = {
  yaku: YAKU_PAGES.map((p) => p.key),
  points: POINTS_SUBS,
};
const SUMMARY_MAX = 200;

const MAX_YAKU_ENTRIES = 20;

function badIntent(): never {
  throw new DomainError("bad_intent", "镜像意图格式错误");
}

function seatListOrBad(v: unknown): Seat[] {
  if (!Array.isArray(v) || v.length > 4) return badIntent();
  for (const s of v) assertSeat(s);
  return v as Seat[];
}

/** 引擎结果的形状校验（镜像用，不做业务判断）。 */
function evaluatedOrBad(v: unknown): EvaluatedHand {
  if (typeof v !== "object" || v === null) return badIntent();
  const r = v as Record<string, unknown>;
  const int = (x: unknown, max: number) =>
    typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max ? x : badIntent();
  if (typeof r.isAgari !== "boolean") return badIntent();
  if (typeof r.yaku !== "object" || r.yaku === null) return badIntent();
  const entries = Object.entries(r.yaku as Record<string, unknown>);
  if (entries.length > MAX_YAKU_ENTRIES) return badIntent();
  const yaku: Record<string, number> = {};
  for (const [k, n] of entries) {
    if (k.length > 32) return badIntent();
    yaku[k] = int(n, 200);
  }
  const reason = r.reason;
  if (reason !== undefined && reason !== "noYaku" && reason !== "notAgari") return badIntent();
  return {
    han: int(r.han, 200),
    fu: int(r.fu, 110),
    yakuman: int(r.yakuman, 6),
    yaku,
    isAgari: r.isAgari,
    ...(reason === undefined ? {} : { reason }),
  };
}

/** 校验并规范化客户端发来的镜像意图；形状不对即抛 DomainError。 */
export function validateUiIntent(input: unknown): UiIntent {
  const bad = badIntent;
  if (typeof input !== "object" || input === null) return bad();
  const v = input as Record<string, unknown>;
  switch (v.kind) {
    case "none":
    case "rules":
    case "adjust":
      return { kind: v.kind };
    case "reference": {
      if (!REFERENCE_TABS.includes(v.tab as ReferenceTab)) return bad();
      const tab = v.tab as ReferenceTab;
      if (typeof v.sub !== "string" || !REFERENCE_SUBS[tab].includes(v.sub)) return bad();
      return { kind: "reference", tab, sub: v.sub };
    }
    case "settlement": {
      if (!SETTLEMENT_MODES.includes(v.mode as (typeof SETTLEMENT_MODES)[number])) return bad();
      const deltas = v.deltas;
      if (
        deltas !== null &&
        (!Array.isArray(deltas) || deltas.length !== 4 || !deltas.every((d) => Number.isFinite(d)))
      ) {
        return bad();
      }
      const summary = v.summary;
      if (summary !== null && typeof summary !== "string") return bad();
      if (v.loser !== null) assertSeat(v.loser);
      const riichi = seatListOrBad(v.riichi);
      if (!Array.isArray(v.wins) || v.wins.length > 3) return bad();
      const wins = v.wins.map((w): SettlementWinView => {
        if (typeof w !== "object" || w === null) return bad();
        const r = w as Record<string, unknown>;
        assertSeat(r.winner);
        if (r.valueText !== null && typeof r.valueText !== "string") return bad();
        return {
          winner: r.winner,
          valueText: typeof r.valueText === "string" ? r.valueText.slice(0, SUMMARY_MAX) : null,
          hand: r.hand === null ? null : validateHandShape(r.hand),
          evaluated: r.evaluated === null ? null : evaluatedOrBad(r.evaluated),
        };
      });
      return {
        kind: "settlement",
        mode: v.mode as (typeof SETTLEMENT_MODES)[number],
        deltas: deltas as number[] | null,
        summary: typeof summary === "string" ? summary.slice(0, SUMMARY_MAX) : null,
        loser: v.loser as Seat | null,
        riichi,
        wins,
      };
    }
    default:
      return bad();
  }
}

export interface UiState {
  playerId: string | null;
  seat: Seat | null;
  name: string;
  intent: UiIntent;
  at: number;
}

/** 主控台管理的本地玩家（REST DTO）。 */
export interface LocalPlayerView extends PlayerRef {
  /** 已完成对局数 */
  games: number;
}

export interface PlayerStats {
  games: number;
  averageRank: number | null;
  totalScore: number;
  rankCounts: [number, number, number, number];
  recent: Array<{
    roomCode: string;
    gameNo: number;
    finishedAt: number;
    points: number;
    rank: number;
    score: number;
  }>;
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
  | { type: "pong" };
