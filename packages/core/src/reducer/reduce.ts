import { DomainError } from "../progress/advance";
import { validateRules } from "../rules/validate";
import { isGameCommand, type LobbyCommand } from "../types/commands";
import type { RoomEvent } from "../types/events";
import type { RoomRules } from "../types/rules";
import { seatNames, type RoomState } from "../types/state";
import { applyGameCommand, createGame } from "./game";
import { createUndoable, push, redo, undo } from "./undoable";

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

function applyLobbyCommand(room: RoomState, cmd: LobbyCommand): RoomState {
  switch (cmd.type) {
    case "setRules": {
      if (room.phase === "playing") throw new DomainError("locked", "开局后不能修改规则");
      return { ...room, rules: validateRules(cmd.rules) };
    }
    case "sit": {
      if (room.phase === "playing") throw new DomainError("locked", "开局后不能换座");
      const seats = [...room.seats];
      const existing = seats.findIndex((p) => p?.id === cmd.player.id);
      if (existing !== -1) seats[existing] = null;
      if (seats[cmd.seat]) throw new DomainError("seat_taken", "该座位已有人");
      seats[cmd.seat] = cmd.player;
      const ready = [...room.ready];
      ready[cmd.seat] = false;
      if (existing !== -1) ready[existing] = false;
      return { ...room, seats, ready };
    }
    case "leave": {
      if (room.phase === "playing") throw new DomainError("locked", "开局后不能离座");
      const seats = [...room.seats];
      const ready = [...room.ready];
      seats[cmd.seat] = null;
      ready[cmd.seat] = false;
      return { ...room, seats, ready };
    }
    case "setReady": {
      if (!room.seats[cmd.seat]) throw new DomainError("empty_seat", "座位为空");
      const ready = [...room.ready];
      ready[cmd.seat] = cmd.ready;
      return { ...room, ready };
    }
    case "setPlayerName": {
      const player = room.seats[cmd.seat];
      if (!player) throw new DomainError("empty_seat", "座位为空");
      const name = cmd.name.trim();
      if (name.length === 0 || name.length > 12)
        throw new DomainError("bad_name", "昵称需为 1–12 个字符");
      const seats = [...room.seats];
      seats[cmd.seat] = { ...player, name };
      return { ...room, seats };
    }
    case "setPlayerAvatar": {
      const player = room.seats[cmd.seat];
      if (!player) throw new DomainError("empty_seat", "座位为空");
      const seats = [...room.seats];
      seats[cmd.seat] = { ...player, avatar: cmd.avatar };
      return { ...room, seats };
    }
    case "start": {
      if (room.phase === "playing") throw new DomainError("already_playing", "对局进行中");
      if (room.seats.some((p) => p === null)) throw new DomainError("not_full", "四个座位尚未坐满");
      if (!cmd.force && room.ready.some((r) => !r))
        throw new DomainError("not_ready", "还有玩家未准备");
      return room; // 实际建局在 reduce 中使用事件时间
    }
    case "toLobby": {
      if (room.phase === "playing") throw new DomainError("locked", "对局进行中不能返回大厅");
      return { ...room, phase: "lobby", game: null, ready: [false, false, false, false] };
    }
  }
}

/** 纯函数：房间状态 + 事件 → 新房间状态。失败抛 DomainError / RulesError。 */
export function reduceRoom(room: RoomState, event: RoomEvent): RoomState {
  const cmd = event.command;

  if (!isGameCommand(cmd)) {
    const next = applyLobbyCommand(room, cmd);
    if (cmd.type === "start") {
      return {
        ...next,
        phase: "playing",
        game: createUndoable(createGame(next.rules, event.at)),
        gameNo: next.gameNo + 1,
      };
    }
    return next;
  }

  if (cmd.type === "newGame") {
    if (room.seats.some((p) => p === null)) throw new DomainError("not_full", "四个座位尚未坐满");
    return {
      ...room,
      phase: "playing",
      game: createUndoable(createGame(room.rules, event.at)),
      gameNo: room.gameNo + 1,
    };
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
