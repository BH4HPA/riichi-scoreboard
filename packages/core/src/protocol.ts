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

export interface UiState {
  clientId: string;
  playerId: string | null;
  seat: Seat | null;
  name: string;
  intent: UiIntent;
  at: number;
}

export type ClientMessage =
  | { type: "command"; id: string; baseSeq: number; command: ClientCommand }
  | { type: "ui"; intent: UiIntent }
  | { type: "evaluate"; id: string; seat: Seat; hand: HandInput }
  | { type: "ping" };

export type ServerMessage =
  | { type: "welcome"; clientId: string; playerId: string | null }
  | { type: "state"; room: RoomView }
  | { type: "ui"; intents: UiState[] }
  | { type: "ack"; id: string; seq: number }
  | { type: "error"; id: string | null; code: string; message: string }
  | { type: "evaluate"; id: string; result: EvaluatedHand }
  | { type: "pong" };
