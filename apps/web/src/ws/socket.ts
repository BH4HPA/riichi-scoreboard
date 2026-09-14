import type {
  ClientCommand,
  ClientMessage,
  EvaluatedHand,
  HandInput,
  Seat,
  ServerMessage,
  UiIntent,
} from "@riichi/core";
import { wsUrl } from "@/api/client";
import { newId } from "@/lib/utils";
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

type Pending =
  | { kind: "command"; resolve: (seq: number) => void; reject: (e: CommandError) => void }
  | { kind: "evaluate"; resolve: (r: EvaluatedHand) => void; reject: (e: CommandError) => void };

/** 房间 WebSocket：自动重连、命令带 baseSeq、评估请求、镜像意图。 */
export class RoomSocket {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private closedByUser = false;
  private retry = 0;
  private lastIntent: UiIntent = { kind: "none" };
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly code: string,
    private readonly token: string,
  ) {}

  connect(): void {
    this.closedByUser = false;
    const store = useRoomStore.getState();
    store.set({ status: this.retry === 0 ? "connecting" : "reconnecting" });
    const ws = new WebSocket(wsUrl(this.code, this.token));
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      useRoomStore.getState().set({ status: "open" });
      if (this.lastIntent.kind !== "none") this.raw({ type: "ui", intent: this.lastIntent });
      this.heartbeat = setInterval(() => this.raw({ type: "ping" }), 25_000);
    };
    ws.onmessage = (evt) => this.handle(JSON.parse(String(evt.data)) as ServerMessage);
    ws.onclose = (evt) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      for (const p of this.pending.values())
        p.reject(new CommandError("disconnected", "连接已断开"));
      this.pending.clear();
      if (this.closedByUser || evt.code === 4004) {
        useRoomStore.getState().set({ status: "closed" });
        return;
      }
      const delay = Math.min(1000 * 2 ** this.retry, 10_000);
      this.retry += 1;
      useRoomStore.getState().set({ status: "reconnecting" });
      setTimeout(() => {
        if (!this.closedByUser) this.connect();
      }, delay);
    };
    ws.onerror = () => {
      /* onclose 会跟着触发 */
    };
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
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
        store.set({ clientId: msg.clientId, playerId: msg.playerId });
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

  setUi(intent: UiIntent): void {
    this.lastIntent = intent;
    this.raw({ type: "ui", intent });
  }
}
