import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { WS_CLOSE, type RoomView, type ServerMessage } from "@riichi/core";
import { createApp } from "../app";
import { loadConfig } from "../config";

/** 独立的服务器实例：空闲阈值缩到 300 ms，验证看门狗会断开静默连接并让座位变离线。 */
let server: ServerType;
let base = "";
let app: Hono;

beforeAll(async () => {
  const config = { ...loadConfig({}), corsOrigins: [], webDist: null };
  const shell = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: shell });
  const ctx = createApp({
    config,
    dbFile: ":memory:",
    upgradeWebSocket,
    quiet: true,
    timings: { wsIdleMs: 300, autoStartMs: 60_000 },
  });
  shell.route("/", ctx.app);
  app = shell;
  await new Promise<void>((resolve) => {
    server = serve({ fetch: shell.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      base = `127.0.0.1:${info.port}`;
      resolve();
    });
    injectWebSocket(server);
  });
});
afterAll(() => server.close());

async function register(name: string): Promise<string> {
  const res = await app.request("/api/me/register", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return ((await res.json()) as { token: string }).token;
}

describe("WebSocket 空闲看门狗", () => {
  it("不发心跳的连接在阈值后被 4008 断开；另一端看到该座位离线", async () => {
    const silent = await register("静默");
    const watcher = await register("观察");
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { Authorization: `Bearer ${watcher}` },
    });
    const { room } = (await created.json()) as { room: RoomView };

    const states: RoomView[] = [];
    let offline: (r: RoomView) => void = () => undefined;
    const seatOffline = new Promise<RoomView>((r) => (offline = r));
    const w = new WebSocket(`ws://${base}/ws?room=${room.code}&token=${watcher}`);
    w.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data)) as ServerMessage;
      if (m.type !== "state") return;
      states.push(m.room);
      if (m.room.seats[0] && !m.room.online[0]) offline(m.room);
    });
    await new Promise((r) => w.addEventListener("open", r));
    // 观察端要活着：按客户端节奏发心跳
    const beat = setInterval(() => w.send(JSON.stringify({ type: "ping" })), 100);

    const s = new WebSocket(`ws://${base}/ws?room=${room.code}&token=${silent}`);
    await new Promise((r) => s.addEventListener("open", r));
    await new Promise((r) => s.addEventListener("message", r)); // welcome
    s.send(
      JSON.stringify({ type: "command", id: "sit", baseSeq: 0, command: { type: "sit", seat: 0 } }),
    );
    const closed = new Promise<number>((r) => s.addEventListener("close", (e) => r(e.code)));

    // 只发过一条命令，之后静默 → 看门狗 300 ms 后断开
    expect(await closed).toBe(WS_CLOSE.idle);
    // 服务端收到关闭确认（或 1 s 后强制掐断）→ leave → 广播离线
    const last = await seatOffline;
    expect(last.seats[0]?.name).toBe("静默");
    expect(states.some((r) => r.online[0])).toBe(true); // 入座那一刻是在线的
    clearInterval(beat);
    w.close();
  });
});
