import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client", () => ({ wsUrl: () => "ws://test/ws" }));

import { HANDSHAKE_TIMEOUT_MS, RoomSocket } from "./socket";
import { useRoomStore } from "./store";

/** 只记录实例与 close 调用的假 WebSocket：事件由测试手动触发。 */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(): void {}
  close(): void {
    this.closed = true;
    this.readyState = FakeSocket.CLOSING;
  }
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  drop(code = 1006): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  useRoomStore.getState().set({ status: "idle" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RoomSocket 握手超时", () => {
  it("握手一直没有结果：超时丢弃并按退避新建连接", () => {
    const socket = new RoomSocket("ABCDEF", "t");
    socket.connect();
    const [first] = FakeSocket.instances;
    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS - 1);
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(first!.closed).toBe(true);
    expect(useRoomStore.getState().status).toBe("reconnecting");
    // 走退避（首次 1 s），不是立刻重连
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);

    // 连续卡住：退避翻倍
    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS + 1999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);
    socket.close();
  });

  it("被丢弃的连接迟到的 onopen / onclose 不产生任何效果", () => {
    const socket = new RoomSocket("ABCDEF", "t");
    socket.connect();
    const [first] = FakeSocket.instances;
    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS + 1000);
    const second = FakeSocket.instances[1]!;
    expect(FakeSocket.instances).toHaveLength(2);

    first!.open();
    expect(useRoomStore.getState().status).toBe("reconnecting");
    first!.drop();
    vi.advanceTimersByTime(20_000);
    // 旧连接的 onclose 没有再排一次重连；新连接自己的握手超时照常生效
    expect(FakeSocket.instances).toHaveLength(3);
    expect(second.closed).toBe(true);
    socket.close();
  });

  it("按时握手成功：计时器清除，不会被误判超时", () => {
    const socket = new RoomSocket("ABCDEF", "t");
    socket.connect();
    const [first] = FakeSocket.instances;
    first!.open();
    expect(useRoomStore.getState().status).toBe("open");
    // 心跳会发 ping（假连接不回），这里只看握手计时器：超时时刻过后连接仍在
    vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS);
    expect(first!.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
    socket.close();
  });
});
