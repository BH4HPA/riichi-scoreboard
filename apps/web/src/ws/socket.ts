import {
  WS_CLOSE,
  type ClientCommand,
  type ClientMessage,
  type EvaluatedHand,
  type HandInput,
  type Seat,
  type ServerMessage,
  type UiIntent,
} from "@riichi/core";
import { wsUrl } from "@/api/client";
import { newId } from "@/lib/utils";
import { HEARTBEAT_MS, isStale } from "./heartbeat";
import { useRoomStore } from "./store";

export class CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

/** 服务端主动关闭且不应重连的关闭码（定义在 core 协议里） */
const TERMINAL_CLOSE: Record<number, "unauthorized" | "not_found" | "dissolved"> = {
  [WS_CLOSE.unauthorized]: "unauthorized",
  [WS_CLOSE.notFound]: "not_found",
  [WS_CLOSE.dissolved]: "dissolved",
};

type Pending =
  | { kind: "command"; resolve: (seq: number) => void; reject: (e: CommandError) => void }
  | { kind: "evaluate"; resolve: (r: EvaluatedHand) => void; reject: (e: CommandError) => void };

/**
 * 房间 WebSocket：自动重连、命令带 baseSeq、评估请求、镜像意图（按来源合并，取最近打开的）。
 * 保活：5 s 心跳 + 回包看门狗（CDN 会静默回收空闲连接，见 heartbeat.ts）；页面回前台时立即重连。
 */
export class RoomSocket {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private closedByUser = false;
  private retry = 0;
  private readonly intents = new Map<string, { intent: UiIntent; at: number }>();
  private lastSent = "";
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeenAt = 0;
  private readonly onVisible = () => {
    if (document.visibilityState !== "visible" || this.closedByUser) return;
    const state = this.ws?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connect();
  };

  constructor(
    private readonly code: string,
    private readonly token: string,
  ) {
    document.addEventListener("visibilitychange", this.onVisible);
  }

  connect(): void {
    this.closedByUser = false;
    useRoomStore.getState().set({ status: this.retry === 0 ? "connecting" : "reconnecting" });
    const ws = new WebSocket(wsUrl(this.code, this.token));
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      useRoomStore.getState().set({ status: "open" });
      this.lastSent = "";
      this.flushUi();
      this.lastSeenAt = Date.now();
      this.heartbeat = setInterval(() => {
        if (isStale(this.lastSeenAt, Date.now())) this.dropAndReconnect(ws);
        else this.raw({ type: "ping" });
      }, HEARTBEAT_MS);
    };
    ws.onmessage = (evt) => {
      if (this.ws !== ws) return;
      this.lastSeenAt = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(evt.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = (evt) => {
      if (this.ws !== ws) return;
      this.teardown();
      const reason = TERMINAL_CLOSE[evt.code];
      if (this.closedByUser || reason) {
        useRoomStore.getState().set({ status: "closed", closedReason: reason ?? null });
        return;
      }
      const delay = Math.min(1000 * 2 ** this.retry, 10_000);
      this.retry += 1;
      useRoomStore.getState().set({ status: "reconnecting" });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.closedByUser && this.ws === ws) this.connect();
      }, delay);
    };
    ws.onerror = () => {
      /* onclose 会跟着触发 */
    };
  }

  close(): void {
    this.closedByUser = true;
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.teardown();
    ws?.close();
    useRoomStore.getState().set({ status: "closed" });
  }

  /** 停心跳、拒绝在途请求；连接本身由调用方处理。 */
  private teardown(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const p of this.pending.values()) p.reject(new CommandError("disconnected", "连接已断开"));
    this.pending.clear();
  }

  /**
   * 看门狗判定连接已死：不等浏览器的关闭握手（对端已消失时 onclose 可能很久才来），
   * 直接丢弃这条连接并立刻重连；旧连接的 onclose 之后到达时因 this.ws 已变而被忽略。
   */
  private dropAndReconnect(ws: WebSocket): void {
    if (this.ws !== ws) return;
    this.teardown();
    this.ws = null;
    ws.close();
    useRoomStore.getState().set({ status: "reconnecting" });
    this.connect();
  }

  private raw(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private handle(msg: ServerMessage): void {
    const store = useRoomStore.getState();
    switch (msg.type) {
      case "welcome":
        store.set({ playerId: msg.playerId });
        return;
      case "state":
        store.set({ room: msg.room });
        return;
      case "ui":
        store.set({ intents: msg.intents });
        return;
      case "ack": {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (p?.kind === "command") p.resolve(msg.seq);
        return;
      }
      case "evaluate": {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (p?.kind === "evaluate") p.resolve(msg.result);
        return;
      }
      case "error": {
        const p = msg.id ? this.pending.get(msg.id) : undefined;
        if (msg.id) this.pending.delete(msg.id);
        if (p) p.reject(new CommandError(msg.code, msg.message));
        else store.notify("error", msg.message);
        return;
      }
      case "pong":
        return;
    }
  }

  /** 发送命令；baseSeq 取当前视图的 seq。 */
  command(command: ClientCommand): Promise<number> {
    const room = useRoomStore.getState().room;
    if (!room) return Promise.reject(new CommandError("no_room", "尚未连接房间"));
    const id = newId();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { kind: "command", resolve, reject });
      if (!this.raw({ type: "command", id, baseSeq: room.seq, command })) {
        this.pending.delete(id);
        reject(new CommandError("disconnected", "连接已断开"));
      }
    });
  }

  evaluate(seat: Seat, hand: HandInput): Promise<EvaluatedHand> {
    const id = newId();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { kind: "evaluate", resolve, reject });
      if (!this.raw({ type: "evaluate", id, seat, hand })) {
        this.pending.delete(id);
        reject(new CommandError("disconnected", "连接已断开"));
      }
    });
  }

  /** 某个来源（弹窗/面板）的镜像意图；kind=none 表示该来源已关闭。 */
  setUi(source: string, intent: UiIntent): void {
    if (intent.kind === "none") this.intents.delete(source);
    else this.intents.set(source, { intent, at: Date.now() });
    this.flushUi();
  }

  private flushUi(): void {
    let latest: { intent: UiIntent; at: number } | null = null;
    for (const entry of this.intents.values()) if (!latest || entry.at >= latest.at) latest = entry;
    const intent: UiIntent = latest?.intent ?? { kind: "none" };
    const payload = JSON.stringify(intent);
    if (payload === this.lastSent) return;
    if (this.raw({ type: "ui", intent })) this.lastSent = payload;
  }
}
