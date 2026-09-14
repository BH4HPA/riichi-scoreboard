import { randomInt } from "node:crypto";
import {
  DomainError,
  RulesError,
  createRoom,
  isGameCommand,
  kyokuWind,
  reduceRoom,
  replay,
  toRoomView,
  type ClientCommand,
  type Command,
  type EventActor,
  type GameCommand,
  type RoomEvent,
  type RoomRules,
  type RoomState,
  type RoomView,
  type UiIntent,
  type UiState,
  type WinValue,
} from "@riichi/core";
import type { RoomsRepo } from "../db/rooms";
import type { ResultsRepo } from "../db/results";
import { evaluateHand } from "../engine/evaluate";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface RoomClient {
  clientId: string;
  playerId: string | null;
  name: string;
  send(message: string): void;
}

export interface LiveRoom {
  code: string;
  state: RoomState;
  seq: number;
  clients: Map<string, RoomClient>;
  ui: Map<string, UiState>;
  lastActivity: number;
}

export class RoomNotFound extends Error {
  constructor(code: string) {
    super(`房间 ${code} 不存在`);
    this.name = "RoomNotFound";
  }
}

export class StaleCommand extends Error {
  constructor(public readonly currentSeq: number) {
    super("房间状态已更新，请刷新后重试");
    this.name = "StaleCommand";
  }
}

export class RoomRegistry {
  private readonly rooms = new Map<string, LiveRoom>();

  constructor(
    private readonly roomsRepo: RoomsRepo,
    private readonly resultsRepo: ResultsRepo,
    private readonly now: () => number = Date.now,
  ) {}

  createRoom(rules: RoomRules): LiveRoom {
    const randomCode = () =>
      Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    let code = randomCode();
    while (this.roomsRepo.exists(code)) code = randomCode();
    const at = this.now();
    this.roomsRepo.create(code, rules, at);
    const live: LiveRoom = {
      code,
      state: createRoom(code, rules),
      seq: 0,
      clients: new Map(),
      ui: new Map(),
      lastActivity: at,
    };
    this.rooms.set(code, live);
    return live;
  }

  /** 内存没有则从事件流回放。 */
  get(code: string): LiveRoom {
    const cached = this.rooms.get(code);
    if (cached) return cached;
    const row = this.roomsRepo.get(code);
    if (!row) throw new RoomNotFound(code);
    const events = this.roomsRepo.events(code);
    const live: LiveRoom = {
      code,
      state: replay(createRoom(code, row.rules), events),
      seq: events.length ? events[events.length - 1]!.seq : 0,
      clients: new Map(),
      ui: new Map(),
      lastActivity: row.updated_at,
    };
    this.rooms.set(code, live);
    return live;
  }

  view(room: LiveRoom): RoomView {
    return toRoomView(room.state, room.seq);
  }

  /** 校验 baseSeq → 补全牌面评估 → reduce → 落库 → 广播。 */
  apply(
    room: LiveRoom,
    baseSeq: number,
    clientCommand: ClientCommand,
    actor: EventActor,
  ): RoomEvent {
    if (baseSeq !== room.seq) throw new StaleCommand(room.seq);
    const command = this.enrich(room.state, clientCommand);
    const event: RoomEvent = { seq: room.seq + 1, at: this.now(), actor, command };
    const next = reduceRoom(room.state, event);
    this.roomsRepo.appendEvent(room.code, event);
    room.state = next;
    room.seq = event.seq;
    room.lastActivity = event.at;
    this.resultsRepo.sync(next);
    this.broadcastState(room);
    return event;
  }

  private enrich(state: RoomState, cmd: ClientCommand): Command {
    if (!isGameCommand(cmd as Command)) return cmd as Command;
    const game = state.game?.present;
    const evaluate = (seat: number, value: { kind: "manual" } | { kind: "hand" }): WinValue => {
      if (value.kind === "manual") return value as WinValue;
      if (!game) throw new DomainError("no_game", "尚未开局");
      const hand = (value as { kind: "hand"; hand: Parameters<typeof evaluateHand>[0] }).hand;
      const result = evaluateHand(
        hand,
        { seat: seat as 0 | 1 | 2 | 3, dealer: game.dealer, roundWind: kyokuWind(game.kyoku) },
        state.rules,
      );
      return { kind: "hand", hand, result };
    };
    switch (cmd.type) {
      case "tsumo":
        return { ...cmd, value: evaluate(cmd.winner, cmd.value) } as GameCommand;
      case "ron":
        return {
          ...cmd,
          wins: cmd.wins.map((w) => ({ ...w, value: evaluate(w.winner, w.value) })),
        } as GameCommand;
      default:
        return cmd as Command;
    }
  }

  join(room: LiveRoom, client: RoomClient): void {
    room.clients.set(client.clientId, client);
    room.lastActivity = this.now();
    client.send(JSON.stringify({ type: "state", room: this.view(room) }));
    client.send(JSON.stringify({ type: "ui", intents: this.uiList(room) }));
  }

  leave(room: LiveRoom, clientId: string): void {
    room.clients.delete(clientId);
    if (room.ui.delete(clientId)) this.broadcastUi(room);
    room.lastActivity = this.now();
  }

  setUi(room: LiveRoom, client: RoomClient, intent: UiIntent): void {
    if (intent.kind === "none") {
      room.ui.delete(client.clientId);
    } else {
      const seat = room.state.seats.findIndex((p) => p && p.id === client.playerId);
      room.ui.set(client.clientId, {
        clientId: client.clientId,
        playerId: client.playerId,
        seat: seat === -1 ? null : (seat as 0 | 1 | 2 | 3),
        name: client.name,
        intent,
        at: this.now(),
      });
    }
    this.broadcastUi(room);
  }

  uiList(room: LiveRoom): UiState[] {
    return [...room.ui.values()].sort((a, b) => b.at - a.at);
  }

  broadcastState(room: LiveRoom): void {
    const payload = JSON.stringify({ type: "state", room: this.view(room) });
    for (const c of room.clients.values()) c.send(payload);
  }

  broadcastUi(room: LiveRoom): void {
    const payload = JSON.stringify({ type: "ui", intents: this.uiList(room) });
    for (const c of room.clients.values()) c.send(payload);
  }

  /** 卸载长时间无人且无活动的房间，释放内存；状态可随时从事件流恢复。 */
  evictIdle(idleMs: number): number {
    const cutoff = this.now() - idleMs;
    let evicted = 0;
    for (const [code, room] of this.rooms) {
      if (room.clients.size === 0 && room.lastActivity < cutoff) {
        this.rooms.delete(code);
        evicted += 1;
      }
    }
    return evicted;
  }
}

export function describeError(err: unknown): { code: string; message: string } {
  if (err instanceof StaleCommand) return { code: "stale", message: err.message };
  if (err instanceof DomainError) return { code: err.code, message: err.message };
  if (err instanceof RulesError) return { code: "rules", message: err.message };
  if (err instanceof RoomNotFound) return { code: "room_not_found", message: err.message };
  return { code: "internal", message: err instanceof Error ? err.message : "未知错误" };
}
