import { DomainError } from "../progress/advance";
import { validateRules } from "../rules/validate";
import { isGameCommand, type LobbyCommand } from "../types/commands";
import type { RoomEvent } from "../types/events";
import type { RoomRules } from "../types/rules";
import { seatNames, type PlayerRef, type RoomState } from "../types/state";
import { applyGameCommand, createGame } from "./game";
import { createUndoable, push, redo, undo } from "./undoable";
import { assertSeat } from "./validateCommand";

export function createRoom(code: string, rules: RoomRules): RoomState {
  return {
    code,
    phase: "lobby",
    rules,
    seats: [null, null, null, null],
    ready: [false, false, false, false],
    game: null,
    gameNo: 0,
  };
}

function requireLobby(room: RoomState, what: string): void {
  if (room.phase !== "lobby") {
    throw new DomainError(
      "locked",
      room.phase === "playing" ? `开局后不能${what}` : `请先返回大厅再${what}`,
    );
  }
}

function applyLobbyCommand(room: RoomState, cmd: LobbyCommand): RoomState {
  switch (cmd.type) {
    case "setRules": {
      requireLobby(room, "修改规则");
      return { ...room, rules: validateRules(cmd.rules) };
    }
    case "sit": {
      requireLobby(room, "换座");
      assertSeat(cmd.seat);
      const seats = [...room.seats];
      const existing = seats.findIndex((p) => p?.id === cmd.player.id);
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
      assertSeat(cmd.seat);
      const seats = [...room.seats];
      const ready = [...room.ready];
      seats[cmd.seat] = null;
      ready[cmd.seat] = false;
      return { ...room, seats, ready };
    }
    case "setReady": {
      assertSeat(cmd.seat);
      if (!room.seats[cmd.seat]) throw new DomainError("empty_seat", "座位为空");
      const ready = [...room.ready];
      ready[cmd.seat] = cmd.ready;
      return { ...room, ready };
    }
    case "syncProfile": {
      assertSeat(cmd.seat);
      const current = room.seats[cmd.seat];
      if (!current || current.id !== cmd.player.id)
        throw new DomainError("empty_seat", "座位与玩家不符");
      const seats = [...room.seats];
      seats[cmd.seat] = cmd.player;
      return { ...room, seats };
    }
    case "start": {
      requireLobby(room, "开局");
      if (room.seats.some((p) => p === null)) throw new DomainError("not_full", "四个座位尚未坐满");
      if (!cmd.force && room.ready.some((r) => !r)) {
        throw new DomainError("not_ready", "还有玩家未准备");
      }
      return room; // 实际建局在 reduce 中使用事件时间
    }
    case "toLobby": {
      if (room.phase === "playing") throw new DomainError("locked", "对局进行中不能返回大厅");
      return { ...room, phase: "lobby", game: null, ready: [false, false, false, false] };
    }
    default:
      throw new DomainError("bad_command", `未知命令 ${(cmd as { type: string }).type}`);
  }
}

function startGame(room: RoomState, at: number): RoomState {
  const players = room.seats.map((p) => {
    if (!p) throw new DomainError("not_full", "四个座位尚未坐满");
    return p;
  }) as PlayerRef[];
  return {
    ...room,
    phase: "playing",
    game: createUndoable(createGame(room.rules, players, at)),
    gameNo: room.gameNo + 1,
  };
}

/** 纯函数：房间状态 + 事件 → 新房间状态。失败抛 DomainError / RulesError。 */
export function reduceRoom(room: RoomState, event: RoomEvent): RoomState {
  const cmd = event.command;

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

  if (cmd.type === "undo") {
    const game = undo(room.game);
    if (!game) throw new DomainError("nothing_to_undo", "暂无可撤销的结算");
    return { ...room, game, phase: game.present.status === "finished" ? "finished" : "playing" };
  }
  if (cmd.type === "redo") {
    const game = redo(room.game);
    if (!game) throw new DomainError("nothing_to_redo", "暂无可重做的结算");
    return { ...room, game, phase: game.present.status === "finished" ? "finished" : "playing" };
  }

  const present = applyGameCommand(room.game.present, cmd, {
    seq: event.seq,
    at: event.at,
    names: seatNames(room),
    rules: room.rules,
  });
  return {
    ...room,
    game: push(room.game, present),
    phase: present.status === "finished" ? "finished" : "playing",
  };
}

/** 从事件流回放。 */
export function replay(room: RoomState, events: readonly RoomEvent[]): RoomState {
  return events.reduce(reduceRoom, room);
}
