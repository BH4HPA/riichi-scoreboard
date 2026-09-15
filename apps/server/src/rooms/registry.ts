import { randomInt } from "node:crypto";
import {
  AUTO_START_MS,
  DomainError,
  RulesError,
  autoStartEligible,
  createRoom,
  dealerOf,
  isLocalPlayer,
  kyokuWind,
  reduceRoom,
  replay,
  seatOfPlayer,
  seatsOnline,
  STOPS_MUSIC,
  toRoomView,
  validateCommand,
  validateMusicTrack,
  validateUiIntent,
  type ClientCommand,
  type ClientWinValue,
  type Command,
  type EventActor,
  type GameCommand,
  type MusicState,
  type PlayerRef,
  type RoomEvent,
  type RoomRules,
  type RoomState,
  type RoomView,
  type Seat,
  type UiState,
  type WinValue,
  WS_CLOSE,
} from "@riichi/core";
import { toPlayerRef, type PlayersRepo } from "../db/players";
import type { RoomsRepo } from "../db/rooms";
import type { ResultsRepo } from "../db/results";
import { evaluateHand } from "../engine/evaluate";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SYSTEM_ACTOR: EventActor = { playerId: null, clientId: "system" };

export interface RoomClient {
  clientId: string;
  playerId: string;
  name: string;
  send(message: string): void;
  close(code: number, reason: string): void;
}

export interface LiveRoom {
  code: string;
  state: RoomState;
  seq: number;
  clients: Map<string, RoomClient>;
  ui: Map<string, UiState>;
  /** 电视正在播放的立直音乐；随 state 广播，结算类命令提交后清空 */
  music: MusicState | null;
  lastActivity: number;
  /** 自动开局倒计时；null = 未在倒计时 */
  autoStart: { at: number; timer: ReturnType<typeof setTimeout> } | null;
}

export class RoomNotFound extends Error {
  constructor(code: string) {
    super(`房间 ${code} 不存在`);
    this.name = "RoomNotFound";
  }
}

export class RoomClosed extends Error {
  constructor(code: string) {
    super(`房间 ${code} 已解散`);
    this.name = "RoomClosed";
  }
}

class StaleCommand extends Error {
  constructor() {
    super("房间状态已更新，请刷新后重试");
    this.name = "StaleCommand";
  }
}

function samePlayer(a: PlayerRef, b: PlayerRef): boolean {
  return a.id === b.id && a.name === b.name && a.avatar === b.avatar;
}

export class RoomRegistry {
  private readonly rooms = new Map<string, LiveRoom>();

  constructor(
    private readonly roomsRepo: RoomsRepo,
    private readonly resultsRepo: ResultsRepo,
    private readonly players: PlayersRepo,
    private readonly now: () => number = Date.now,
    /** 自动开局倒计时；测试可缩短 */
    private readonly autoStartMs: number = AUTO_START_MS,
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
      music: null,
      lastActivity: at,
      autoStart: null,
    };
    this.rooms.set(code, live);
    return live;
  }

  /** 内存没有则从事件流回放；已解散的房间用 closed_at 短路，不回放。 */
  get(code: string): LiveRoom {
    const cached = this.rooms.get(code);
    if (cached?.state.phase === "closed") {
      // 解散后本应由 ws 层 closeRoom 卸载；若未来到这里说明收尾被跳过，补做一次
      this.closeRoom(cached);
      throw new RoomClosed(code);
    }
    if (cached) return cached;
    const row = this.roomsRepo.get(code);
    if (!row) throw new RoomNotFound(code);
    if (row.closed_at !== null) throw new RoomClosed(code);
    const events = this.roomsRepo.events(code);
    const live: LiveRoom = {
      code,
      state: replay(createRoom(code, row.rules), events),
      seq: events.length ? events[events.length - 1]!.seq : 0,
      clients: new Map(),
      ui: new Map(),
      music: null,
      lastActivity: row.updated_at,
      autoStart: null,
    };
    this.rooms.set(code, live);
    return live;
  }

  /** 房间里有活动连接的玩家 id */
  private onlineIds(room: LiveRoom): Set<string> {
    return new Set([...room.clients.values()].map((c) => c.playerId));
  }

  view(room: LiveRoom): RoomView {
    const autoStartIn = room.autoStart ? Math.max(0, room.autoStart.at - this.now()) : null;
    return toRoomView(room.state, room.seq, this.onlineIds(room), autoStartIn, room.music);
  }

  /** 校验 baseSeq → 形状校验 → 按 actor 补全/鉴权 → reduce → 事务落库 → 广播。 */
  apply(room: LiveRoom, baseSeq: number, rawCommand: unknown, actor: EventActor): RoomEvent {
    if (baseSeq !== room.seq) throw new StaleCommand();
    const command = this.enrich(room, validateCommand(rawCommand), actor);
    return this.commit(room, command, actor);
  }

  /**
   * 自动开局：条件成立且未在倒计时 → 起 3 s 计时；条件不成立 → 取消。
   * 每次状态或连接变化后调用；到点时再校验一次，条件变了就不开。
   */
  private reconcileAutoStart(room: LiveRoom): void {
    const eligible = autoStartEligible(room.state, seatsOnline(room.state, this.onlineIds(room)));
    if (!eligible) {
      if (room.autoStart) clearTimeout(room.autoStart.timer);
      room.autoStart = null;
      return;
    }
    if (room.autoStart) return;
    const timer = setTimeout(() => {
      room.autoStart = null;
      if (this.rooms.get(room.code) !== room) return;
      try {
        if (autoStartEligible(room.state, seatsOnline(room.state, this.onlineIds(room)))) {
          this.commit(room, { type: "start", force: false }, SYSTEM_ACTOR);
        } else {
          this.broadcastState(room);
        }
      } catch (err) {
        // 定时器里的异常没有人接，不能让它变成 uncaughtException
        console.error(`[autostart] room=${room.code}`, err);
        this.broadcastState(room);
      }
    }, this.autoStartMs);
    timer.unref?.();
    room.autoStart = { at: this.now() + this.autoStartMs, timer };
  }

  private commit(room: LiveRoom, command: Command, actor: EventActor): RoomEvent {
    const event: RoomEvent = { seq: room.seq + 1, at: this.now(), actor, command };
    const next = reduceRoom(room.state, event);
    this.roomsRepo.transaction(() => {
      this.roomsRepo.appendEvent(room.code, event);
      this.resultsRepo.onTransition(room.state, next);
      if (next.phase === "closed") this.roomsRepo.markClosed(room.code, event.at);
    });
    room.state = next;
    room.seq = event.seq;
    room.lastActivity = event.at;
    if (STOPS_MUSIC[command.type]) room.music = null;
    this.reconcileAutoStart(room);
    this.broadcastState(room);
    return event;
  }

  /**
   * 解散后的收尾：关闭所有连接并从内存卸载。由 ws 层在给发起者回 ack 之后调用，
   * 否则发起者会先收到断开而拿不到 ack。
   */
  closeRoom(room: LiveRoom): void {
    if (room.autoStart) clearTimeout(room.autoStart.timer);
    room.autoStart = null;
    for (const c of room.clients.values()) c.close(WS_CLOSE.dissolved, "dissolved");
    room.clients.clear();
    room.ui.clear();
    this.rooms.delete(room.code);
  }

  /**
   * 客户端命令 → 内部命令：入座按 token 填玩家；本地玩家由创建者带入且即已准备；
   * 座位类命令只能操作自己的座位（本地玩家的座位人人可操作；离线设备玩家的座位任何人可请离）；
   * 牌面交引擎评估。
   */
  private enrich(room: LiveRoom, cmd: ClientCommand, actor: EventActor): Command {
    const state = room.state;
    // 只看座位快照：本人或本地玩家可操作；不回查玩家表，删档案也不影响历史房间
    const own = (seat: Seat, what: string, allowOffline = false) => {
      const occupant = state.seats[seat];
      if (!occupant) throw new DomainError("empty_seat", "座位为空");
      if (occupant.id === actor.playerId || isLocalPlayer(occupant)) return;
      if (allowOffline && !this.onlineIds(room).has(occupant.id)) return;
      throw new DomainError("forbidden", `只能${what}自己的座位`);
    };
    switch (cmd.type) {
      case "sit": {
        const row = actor.playerId ? this.players.byId(actor.playerId) : null;
        if (!row) throw new DomainError("unauthorized", "需要先注册设备");
        return { type: "sit", seat: cmd.seat, player: toPlayerRef(row) };
      }
      case "sitLocal": {
        const row = this.players.byId(cmd.playerId);
        if (!row || row.kind !== "local" || row.created_by !== actor.playerId) {
          throw new DomainError("forbidden", "只能安排本设备创建的本地玩家入座");
        }
        return { type: "sit", seat: cmd.seat, player: toPlayerRef(row), ready: true };
      }
      case "leave":
        own(cmd.seat, "离开", true);
        return cmd;
      case "setReady":
        own(cmd.seat, "准备");
        return cmd;
      case "tsumo":
        return { ...cmd, value: this.evaluate(state, cmd.winner, cmd.value) } as GameCommand;
      case "ron":
        return {
          ...cmd,
          wins: cmd.wins.map((w) => ({ ...w, value: this.evaluate(state, w.winner, w.value) })),
        } as GameCommand;
      default:
        return cmd;
    }
  }

  private evaluate(state: RoomState, seat: Seat, value: ClientWinValue): WinValue {
    if (value.kind === "manual") return value;
    const game = state.game?.present;
    if (!game) throw new DomainError("no_game", "尚未开局");
    const result = evaluateHand(
      value.hand,
      { seat, dealer: dealerOf(game.kyoku), roundWind: kyokuWind(game.kyoku) },
      state.rules,
    );
    return { kind: "hand", hand: value.hand, result };
  }

  /** 玩家档案变更后，把已入座房间里的快照同步为最新（只处理内存中的房间；冷房间在下次加入时同步）。 */
  syncProfile(player: PlayerRef): void {
    for (const room of this.rooms.values()) this.syncSeat(room, player);
  }

  /** 返回是否提交了同步事件（提交本身已广播） */
  private syncSeat(room: LiveRoom, player: PlayerRef): boolean {
    const seat = seatOfPlayer(room.state.seats, player.id);
    if (seat === null || samePlayer(room.state.seats[seat]!, player)) return false;
    this.commit(room, { type: "syncProfile", seat, player }, SYSTEM_ACTOR);
    return true;
  }

  join(room: LiveRoom, client: RoomClient): void {
    room.clients.set(client.clientId, client);
    room.lastActivity = this.now();
    const row = this.players.byId(client.playerId);
    const synced = row ? this.syncSeat(room, toPlayerRef(row)) : false;
    // 在线状态变了，所有人都要刷新座位卡（档案同步已提交并广播过则不再重复）
    if (!synced) {
      this.reconcileAutoStart(room);
      this.broadcastState(room);
    }
    client.send(JSON.stringify({ type: "ui", intents: this.uiList(room) }));
  }

  leave(room: LiveRoom, clientId: string): void {
    if (!room.clients.delete(clientId)) return;
    if (room.ui.delete(clientId)) this.broadcastUi(room);
    room.lastActivity = this.now();
    this.reconcileAutoStart(room);
    this.broadcastState(room);
  }

  setUi(room: LiveRoom, client: RoomClient, rawIntent: unknown): void {
    const intent = validateUiIntent(rawIntent);
    if (intent.kind === "none") {
      room.ui.delete(client.clientId);
    } else {
      room.ui.set(client.clientId, {
        playerId: client.playerId,
        seat: seatOfPlayer(room.state.seats, client.playerId),
        name: client.name,
        intent,
        at: this.now(),
      });
    }
    this.broadcastUi(room);
  }

  /** 立直音乐：只在对局进行中可播；null = 停止。变化随 state 广播给所有端。 */
  setMusic(room: LiveRoom, client: RoomClient, rawTrack: unknown): void {
    const track = validateMusicTrack(rawTrack);
    if (track !== null) {
      if (room.state.phase !== "playing") throw new DomainError("no_game", "对局未在进行中");
      // at 严格递增：同一毫秒内连按两次也要让客户端看到变化（同曲重按从头播）
      room.music = {
        track,
        seat: seatOfPlayer(room.state.seats, client.playerId),
        at: Math.max(this.now(), (room.music?.at ?? 0) + 1),
      };
    } else if (room.music === null) {
      return;
    } else {
      room.music = null;
    }
    this.broadcastState(room);
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
        if (room.autoStart) clearTimeout(room.autoStart.timer);
        this.rooms.delete(code);
        evicted += 1;
      }
    }
    return evicted;
  }
}

export interface ErrorInfo {
  code: string;
  message: string;
  /** 非预期异常（需要记日志） */
  internal: boolean;
}

export function describeError(err: unknown): ErrorInfo {
  if (err instanceof StaleCommand) return { code: "stale", message: err.message, internal: false };
  if (err instanceof DomainError) return { code: err.code, message: err.message, internal: false };
  if (err instanceof RulesError) return { code: "rules", message: err.message, internal: false };
  if (err instanceof RoomNotFound) {
    return { code: "room_not_found", message: err.message, internal: false };
  }
  if (err instanceof RoomClosed)
    return { code: "room_closed", message: err.message, internal: false };
  return { code: "internal", message: "服务器内部错误", internal: true };
}
