import { DomainError } from "./progress/advance";
import type { ClientCommand } from "./types/commands";
import type { RoomRules } from "./types/rules";
import type { EvaluatedHand, GameState, HandInput, PlayerRef, RoomState } from "./types/state";
import type { Seat } from "./types/tiles";

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
  game: GameView | null;
  gameNo: number;
}

export function toRoomView(state: RoomState, seq: number): RoomView {
  return {
    code: state.code,
    seq,
    phase: state.phase,
    rules: state.rules,
    seats: state.seats,
    ready: state.ready,
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

/** 手机端当前打开的界面，供电视镜像。 */
export type UiIntent =
  | { kind: "none" }
  | {
      kind: "settlement";
      mode: "tsumo" | "ron" | "draw" | "abortive" | "chombo";
      deltas: number[] | null;
      summary: string | null;
    }
  | { kind: "reference"; tab: "yaku" | "fu" | "points" }
  | { kind: "rules" }
  | { kind: "adjust" };

const SETTLEMENT_MODES = ["tsumo", "ron", "draw", "abortive", "chombo"] as const;
const REFERENCE_TABS = ["yaku", "fu", "points"] as const;
const SUMMARY_MAX = 200;

/** 校验并规范化客户端发来的镜像意图；形状不对即抛 DomainError。 */
export function validateUiIntent(input: unknown): UiIntent {
  const bad = (): never => {
    throw new DomainError("bad_intent", "镜像意图格式错误");
  };
  if (typeof input !== "object" || input === null) return bad();
  const v = input as Record<string, unknown>;
  switch (v.kind) {
    case "none":
    case "rules":
    case "adjust":
      return { kind: v.kind };
    case "reference":
      if (!REFERENCE_TABS.includes(v.tab as (typeof REFERENCE_TABS)[number])) return bad();
      return { kind: "reference", tab: v.tab as (typeof REFERENCE_TABS)[number] };
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
      return {
        kind: "settlement",
        mode: v.mode as (typeof SETTLEMENT_MODES)[number],
        deltas: deltas as number[] | null,
        summary: typeof summary === "string" ? summary.slice(0, SUMMARY_MAX) : null,
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
