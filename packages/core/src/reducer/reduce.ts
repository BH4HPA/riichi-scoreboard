import { DomainError } from "../types/errors";
import { validateRules } from "../rules/validate";
import {
  isGameCommand,
  isTenCommand,
  type GameCommand,
  type LobbyCommand,
  type TenCommand,
} from "../types/commands";
import type { RoomEvent } from "../types/events";
import type { RoomRules } from "../types/rules";
import {
  SEAT_COUNT,
  isLocalPlayer,
  seatNames,
  type PlayerRef,
  type RoomKind,
  type RoomState,
  type TenRoomState,
  type YonmaRoomState,
} from "../types/state";
import type { Seat } from "../types/tiles";
import { applyTenCommand, createTenGame } from "../ten/reduce";
import { applyGameCommand, createGame, declareRiichi } from "./game";
import { createUndoable, push, redo, undo } from "./undoable";
import { assertSeat } from "./validateCommand";

/** 房型缺省为四人：旧房间（`rooms.kind` 落默认值）与现有调用方得到的状态与从前一致。 */
export function createRoom(code: string, rules: RoomRules, kind?: "yonma"): YonmaRoomState;
export function createRoom(code: string, rules: RoomRules, kind: "ten"): TenRoomState;
export function createRoom(code: string, rules: RoomRules, kind: RoomKind): RoomState;
export function createRoom(code: string, rules: RoomRules, kind: RoomKind = "yonma"): RoomState {
  const count = SEAT_COUNT[kind];
  return {
    kind,
    code,
    phase: "lobby",
    rules,
    seats: Array.from({ length: count }, () => null),
    ready: Array.from({ length: count }, () => false),
    game: null,
    gameNo: 0,
  };
}

/** 形状校验只保证 0–3；座位数随房型而定（二人房只有 0、1），越界在这里挡住 */
function assertRoomSeat(room: RoomState, seat: Seat): void {
  assertSeat(seat);
  if (seat >= room.seats.length) throw new DomainError("bad_seat", "没有这个座位");
}

function notFull(room: RoomState): DomainError {
  return new DomainError("not_full", `${room.kind === "ten" ? "两" : "四"}个座位尚未坐满`);
}

function requireLobby(room: RoomState, what: string): void {
  if (room.phase !== "lobby") {
    throw new DomainError(
      "locked",
      room.phase === "playing" ? `开局后不能${what}` : `请先返回大厅再${what}`,
    );
  }
}

function applyLobbyCommand<R extends RoomState>(room: R, cmd: LobbyCommand): R {
  switch (cmd.type) {
    case "setRules": {
      requireLobby(room, "修改规则");
      const rules = validateRules(cmd.rules);
      if (!cmd.resetReady) return { ...room, rules };
      // 本地玩家由主控台代管、入座即准备，不让它们陷入等待
      const ready = room.seats.map((p, i) => isLocalPlayer(p) && room.ready[i] === true);
      return { ...room, rules, ready };
    }
    case "sit": {
      requireLobby(room, "换座");
      assertRoomSeat(room, cmd.seat);
      const seats = [...room.seats];
      const existing = seats.findIndex((p) => p?.id === cmd.player.id);
      if (existing === cmd.seat) return room;
      if (existing !== -1) seats[existing] = null;
      if (seats[cmd.seat]) throw new DomainError("seat_taken", "该座位已有人");
      seats[cmd.seat] = cmd.player;
      const ready = [...room.ready];
      if (existing !== -1) ready[existing] = false;
      ready[cmd.seat] = cmd.ready ?? false;
      return { ...room, seats, ready };
    }
    case "leave": {
      requireLobby(room, "离座");
      assertRoomSeat(room, cmd.seat);
      const seats = [...room.seats];
      const ready = [...room.ready];
      seats[cmd.seat] = null;
      ready[cmd.seat] = false;
      return { ...room, seats, ready };
    }
    case "setReady": {
      assertRoomSeat(room, cmd.seat);
      if (!room.seats[cmd.seat]) throw new DomainError("empty_seat", "座位为空");
      const ready = [...room.ready];
      ready[cmd.seat] = cmd.ready;
      return { ...room, ready };
    }
    case "syncProfile": {
      assertRoomSeat(room, cmd.seat);
      const current = room.seats[cmd.seat];
      if (!current || current.id !== cmd.player.id)
        throw new DomainError("empty_seat", "座位与玩家不符");
      const seats = [...room.seats];
      seats[cmd.seat] = cmd.player;
      return { ...room, seats };
    }
    case "start": {
      requireLobby(room, "开局");
      if (room.seats.some((p) => p === null)) throw notFull(room);
      if (!cmd.force && room.ready.some((r) => !r)) {
        throw new DomainError("not_ready", "还有玩家未准备");
      }
      return room; // 实际建局在 reduce 中使用事件时间
    }
    case "toLobby": {
      if (room.phase === "playing") throw new DomainError("locked", "对局进行中不能返回大厅");
      // 设备玩家回大厅后重新点「准备」；本地玩家没有手机，入座即准备，回大厅也保持
      return { ...room, phase: "lobby", game: null, ready: room.seats.map(isLocalPlayer) };
    }
    case "dissolve":
      return { ...room, phase: "closed" };
    default:
      throw new DomainError("bad_command", `未知命令 ${(cmd as { type: string }).type}`);
  }
}

function startGame(room: RoomState, at: number): RoomState {
  const players = room.seats.map((p) => {
    if (!p) throw notFull(room);
    return p;
  }) as PlayerRef[];
  const started = { phase: "playing", gameNo: room.gameNo + 1 } as const;
  return room.kind === "ten"
    ? { ...room, ...started, game: createUndoable(createTenGame(players, at)) }
    : { ...room, ...started, game: createUndoable(createGame(room.rules, players, at)) };
}

/** 纯函数：房间状态 + 事件 → 新房间状态（房型不变）。失败抛 DomainError / RulesError。 */
export function reduceRoom(room: YonmaRoomState, event: RoomEvent): YonmaRoomState;
export function reduceRoom(room: TenRoomState, event: RoomEvent): TenRoomState;
export function reduceRoom(room: RoomState, event: RoomEvent): RoomState;
export function reduceRoom(room: RoomState, event: RoomEvent): RoomState {
  const cmd = event.command;
  if (room.phase === "closed") throw new DomainError("closed", "房间已解散");

  if (!isGameCommand(cmd)) {
    const next = applyLobbyCommand(room, cmd);
    return cmd.type === "start" ? startGame(next, event.at) : next;
  }

  if (cmd.type === "newGame") {
    if (room.phase !== "finished")
      throw new DomainError("not_finished", "对局尚未结束，请先终局结算");
    return startGame(room, event.at);
  }

  if (!room.game) throw new DomainError("no_game", "尚未开局");
  // 对局命令按房型分发：两种对局模型互不相通，撤销栈（泛型）共用
  return room.kind === "ten" ? reduceTenGame(room, cmd, event) : reduceYonmaGame(room, cmd, event);
}

function reduceYonmaGame(
  room: YonmaRoomState,
  cmd: GameCommand | TenCommand,
  event: RoomEvent,
): YonmaRoomState {
  if (isTenCommand(cmd)) throw new DomainError("not_here", "这是二人麻将的操作");
  const stack = room.game!;

  if (cmd.type === "declareRiichi") {
    // 替换 present、不动撤销栈：撤销撤的是结算，声明跟着局面快照走
    const present = declareRiichi(stack.present, cmd, room.rules);
    return present === stack.present ? room : { ...room, game: { ...stack, present } };
  }
  if (cmd.type === "undo") {
    const game = undo(stack);
    if (!game) throw new DomainError("nothing_to_undo", "暂无可撤销的结算");
    return { ...room, game, phase: phaseOf(game.present) };
  }
  if (cmd.type === "redo") {
    const game = redo(stack);
    if (!game) throw new DomainError("nothing_to_redo", "暂无可重做的结算");
    return { ...room, game, phase: phaseOf(game.present) };
  }

  const present = applyGameCommand(stack.present, cmd, {
    seq: event.seq,
    at: event.at,
    names: seatNames(room),
    rules: room.rules,
  });
  return { ...room, game: push(stack, present), phase: phaseOf(present) };
}

function reduceTenGame(
  room: TenRoomState,
  cmd: GameCommand | TenCommand,
  event: RoomEvent,
): TenRoomState {
  const stack = room.game!;

  if (cmd.type === "undo") {
    const game = undo(stack);
    if (!game) throw new DomainError("nothing_to_undo", "暂无可撤销的操作");
    return { ...room, game, phase: phaseOf(game.present) };
  }
  if (cmd.type === "redo") {
    const game = redo(stack);
    if (!game) throw new DomainError("nothing_to_redo", "暂无可重做的操作");
    return { ...room, game, phase: phaseOf(game.present) };
  }
  if (!isTenCommand(cmd) && cmd.type !== "endGame") {
    throw new DomainError("not_here", "这是四人麻将的操作");
  }

  const present = applyTenCommand(stack.present, cmd, {
    seq: event.seq,
    at: event.at,
    names: seatNames(room),
    rules: room.rules,
  });
  // 没有状态变化（重复的宣言）：原样返回，服务端据此不落库、不推进 seq
  return present === stack.present
    ? room
    : { ...room, game: push(stack, present), phase: phaseOf(present) };
}

/** 房间阶段跟随当前局面：对局结束即 finished，否则 playing。 */
function phaseOf(present: { status: "playing" | "finished" }): "playing" | "finished" {
  return present.status === "finished" ? "finished" : "playing";
}

export function replay(room: YonmaRoomState, events: readonly RoomEvent[]): YonmaRoomState;
export function replay(room: TenRoomState, events: readonly RoomEvent[]): TenRoomState;
export function replay(room: RoomState, events: readonly RoomEvent[]): RoomState;
export function replay(room: RoomState, events: readonly RoomEvent[]): RoomState {
  return events.reduce<RoomState>((state, event) => reduceRoom(state, event), room);
}
