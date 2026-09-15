import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { ClientMessage, RoomView, ServerMessage, UiState } from "@riichi/core";
import { createApp } from "../app";
import { loadConfig } from "../config";
import { PlayersRepo } from "../db/players";
import { ResultsRepo } from "../db/results";
import { RoomsRepo } from "../db/rooms";
import { RoomRegistry } from "./registry";

let server: ServerType;
let wsUrl = "";
let app: Hono;
let ctx: ReturnType<typeof createApp>;

beforeAll(async () => {
  const config = { ...loadConfig({}), corsOrigins: [], webDist: "/nonexistent" };
  const shell = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: shell });
  ctx = createApp({ config, dbFile: ":memory:", upgradeWebSocket, quiet: true });
  shell.route("/", ctx.app);
  app = shell;
  await new Promise<void>((resolve) => {
    server = serve({ fetch: shell.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      wsUrl = `ws://127.0.0.1:${info.port}`;
      resolve();
    });
    injectWebSocket(server);
  });
});

afterAll(() => {
  server.close();
});

async function register(name: string): Promise<{ token: string; id: string }> {
  const res = await app.request("/api/me/register", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as { token: string; player: { id: string } };
  return { token: body.token, id: body.player.id };
}

class Client {
  readonly socket: WebSocket;
  private readonly ws: WebSocket;
  private readonly queue: ServerMessage[] = [];
  private waiters: Array<(m: ServerMessage) => void> = [];
  private stateWaiters: Array<{ pred: (r: RoomView) => boolean; resolve: (r: RoomView) => void }> =
    [];
  private uiWaiters: Array<{ pred: (u: UiState[]) => boolean; resolve: (u: UiState[]) => void }> =
    [];
  state: RoomView | null = null;
  ui: UiState[] = [];
  constructor(code: string, token: string) {
    this.ws = new WebSocket(`${wsUrl}/ws?room=${code}&token=${token}`);
    this.socket = this.ws;
    this.ws.addEventListener("message", (evt) => {
      const msg = JSON.parse(String(evt.data)) as ServerMessage;
      if (msg.type === "state") {
        this.state = msg.room;
        this.stateWaiters = this.stateWaiters.filter((w) =>
          w.pred(msg.room) ? (w.resolve(msg.room), false) : true,
        );
      }
      if (msg.type === "ui") {
        this.ui = msg.intents;
        this.uiWaiters = this.uiWaiters.filter((w) =>
          w.pred(msg.intents) ? (w.resolve(msg.intents), false) : true,
        );
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter(msg);
      else this.queue.push(msg);
    });
  }
  open(): Promise<void> {
    return new Promise((resolve) => this.ws.addEventListener("open", () => resolve()));
  }
  next(): Promise<ServerMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  async until<T extends ServerMessage["type"]>(
    type: T,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    for (;;) {
      const m = await this.next();
      if (m.type === type) return m as Extract<ServerMessage, { type: T }>;
    }
  }
  /** 命令的最终结果：ack 或 error */
  async outcome(): Promise<Extract<ServerMessage, { type: "ack" | "error" }>> {
    for (;;) {
      const m = await this.next();
      if (m.type === "ack" || m.type === "error") return m;
    }
  }
  waitState(pred: (r: RoomView) => boolean): Promise<RoomView> {
    if (this.state && pred(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve) => this.stateWaiters.push({ pred, resolve }));
  }
  waitUi(pred: (u: UiState[]) => boolean): Promise<UiState[]> {
    if (pred(this.ui)) return Promise.resolve(this.ui);
    return new Promise((resolve) => this.uiWaiters.push({ pred, resolve }));
  }
  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }
  close(): void {
    this.ws.close();
  }
}

describe("rooms end-to-end", () => {
  it("REST：注册、建房、查房、未授权", async () => {
    const anon = await app.request("/api/rooms", { method: "POST" });
    expect(anon.status).toBe(401);
    const me = await register("主控台");
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { Authorization: `Bearer ${me.token}` },
    });
    expect(created.status).toBe(201);
    const { room } = (await created.json()) as { room: RoomView };
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.phase).toBe("lobby");
    const fetched = await app.request(`/api/rooms/${room.code.toLowerCase()}`, {
      headers: { Authorization: `Bearer ${me.token}` },
    });
    expect(fetched.status).toBe(200);
    const missing = await app.request("/api/rooms/ZZZZZZ", {
      headers: { Authorization: `Bearer ${me.token}` },
    });
    expect(missing.status).toBe(404);
  });

  it("WS：四人入座开局，两端同步；并发命令只成功一个；ui 镜像随断开清理", async () => {
    const console_ = await register("主控台");
    const players = await Promise.all(["东", "南", "西", "北"].map(register));
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { Authorization: `Bearer ${console_.token}` },
    });
    const { room } = (await created.json()) as { room: RoomView };

    const tv = new Client(room.code, console_.token);
    await tv.open();
    expect((await tv.until("welcome")).playerId).toBe(console_.id);
    let state = await tv.waitState(() => true);
    expect(state.seq).toBe(0);

    const phones = players.map((p) => new Client(room.code, p.token));
    await Promise.all(phones.map((p) => p.open()));
    for (const p of phones) await p.waitState(() => true);

    // 入座 + 准备（每条命令带当前 seq）
    let seq = 0;
    for (let i = 0; i < 4; i++) {
      phones[i]!.send({
        type: "command",
        id: `sit${i}`,
        baseSeq: seq,
        command: { type: "sit", seat: i as 0 | 1 | 2 | 3 },
      });
      seq = (await phones[i]!.until("ack")).seq;
      phones[i]!.send({
        type: "command",
        id: `ready${i}`,
        baseSeq: seq,
        command: { type: "setReady", seat: i as 0 | 1 | 2 | 3, ready: true },
      });
      seq = (await phones[i]!.until("ack")).seq;
    }
    // 入座信息由服务端按 token 填充
    const seated = await tv.waitState((r) => r.seats.every((p) => p !== null));
    expect(seated.seats.map((p) => p?.name)).toEqual(["东", "南", "西", "北"]);
    // 只能操作自己的座位
    phones[0]!.send({
      type: "command",
      id: "steal",
      baseSeq: seq,
      command: { type: "setReady", seat: 1, ready: false },
    });
    expect(await phones[0]!.outcome()).toMatchObject({ type: "error", code: "forbidden" });
    // 畸形命令被拒绝，房间不受影响
    phones[0]!.send({
      type: "command",
      id: "bad",
      baseSeq: seq,
      command: { type: "leave", seat: 9 } as never,
    });
    expect(await phones[0]!.outcome()).toMatchObject({ type: "error", code: "bad_command" });
    // 未认证的 WebSocket 被拒绝
    const anon = new Client(room.code, "not-a-token");
    await anon.open();
    expect(await anon.until("error")).toMatchObject({ code: "unauthorized" });

    tv.send({
      type: "command",
      id: "start",
      baseSeq: seq,
      command: { type: "start", force: false },
    });
    seq = (await tv.until("ack")).seq;
    // 电视与手机都收到 playing 状态
    state = await tv.waitState((r) => r.phase === "playing");
    expect(state.game?.present.points).toEqual([25000, 25000, 25000, 25000]);
    await phones[3]!.waitState((r) => r.phase === "playing");

    // 并发：两台手机基于同一 baseSeq 提交
    phones[0]!.send({
      type: "command",
      id: "a",
      baseSeq: seq,
      command: {
        type: "tsumo",
        winner: 0,
        value: { kind: "manual", han: 3, fu: 30, yakuman: 0 },
        riichi: [],
      },
    });
    phones[1]!.send({
      type: "command",
      id: "b",
      baseSeq: seq,
      command: {
        type: "tsumo",
        winner: 1,
        value: { kind: "manual", han: 3, fu: 30, yakuman: 0 },
        riichi: [],
      },
    });
    const [ra, rb] = await Promise.all([phones[0]!.outcome(), phones[1]!.outcome()]);
    const outcomes = [ra.type, rb.type].sort();
    expect(outcomes).toEqual(["ack", "error"]);
    const err = ra.type === "error" ? ra : rb;
    expect(err.type === "error" && err.code).toBe("stale");

    // 牌面形态：由服务端评估
    const latest = await app.request(`/api/rooms/${room.code}`, {
      headers: { Authorization: `Bearer ${console_.token}` },
    });
    const { room: after } = (await latest.json()) as { room: RoomView };
    expect(after.game?.present.history).toHaveLength(1);
    phones[2]!.send({
      type: "command",
      id: "hand",
      baseSeq: after.seq,
      command: {
        type: "ron",
        loser: 3,
        riichi: [],
        wins: [
          {
            winner: 2,
            value: {
              kind: "hand",
              hand: {
                closed: [1, 2, 3, 13, 14, 15, 25, 26, 27, 7, 8, 9, 11, 11],
                melds: [],
                winTile: 9,
                tsumo: false,
                doraIndicators: [19],
                uraIndicators: [],
                riichi: false,
                doubleRiichi: false,
                ippatsu: false,
                afterKan: false,
                lastTile: false,
                firstTake: false,
              },
            },
          },
        ],
      },
    });
    const handAck = await phones[2]!.outcome();
    expect(handAck).toMatchObject({ type: "ack" });
    const afterHand = await tv.waitState((r) => r.seq === (handAck as { seq: number }).seq);
    expect(afterHand.game?.present.history[0]?.kind).toBe("ron");

    // evaluate 请求
    phones[2]!.send({
      type: "evaluate",
      id: "ev",
      seat: 2,
      hand: {
        closed: [1, 2, 3, 13, 14, 15, 25, 26, 27, 7, 8, 9, 11, 11],
        melds: [],
        winTile: 9,
        tsumo: true,
        doraIndicators: [19],
        uraIndicators: [],
        riichi: false,
        doubleRiichi: false,
        ippatsu: false,
        afterKan: false,
        lastTile: false,
        firstTake: false,
      },
    });
    const ev = await phones[2]!.until("evaluate");
    expect(ev.result.han).toBe(2); // 平和 + 门清自摸
    expect(ev.result.fu).toBe(20);

    // ui 镜像：手机打开结算框 → 电视收到；断开 → 清理
    phones[3]!.send({
      type: "ui",
      intent: { kind: "settlement", mode: "draw", deltas: null, summary: null },
    });
    const intents = await tv.waitUi((u) => u.length > 0);
    expect(intents[0]!.seat).toBe(3);
    expect(intents[0]!.intent.kind).toBe("settlement");
    phones[3]!.close();
    await tv.waitUi((u) => u.length === 0);

    // 终局 → 战绩落库；返回大厅不删战绩
    const cur = await tv.waitState(() => true);
    tv.send({ type: "command", id: "end", baseSeq: cur.seq, command: { type: "endGame" } });
    const endAck = await tv.outcome();
    expect(endAck).toMatchObject({ type: "ack" });
    const statsOf = async (token: string) =>
      (
        (await (
          await app.request("/api/me/stats", { headers: { Authorization: `Bearer ${token}` } })
        ).json()) as {
          stats: { games: number; recent: Array<{ roomCode: string; rank: number }> };
        }
      ).stats;
    let stats = await statsOf(players[0]!.token);
    expect(stats.games).toBe(1);
    expect(stats.recent[0]).toMatchObject({ roomCode: room.code });
    tv.send({
      type: "command",
      id: "lobby",
      baseSeq: (endAck as { seq: number }).seq,
      command: { type: "toLobby" },
    });
    expect(await tv.outcome()).toMatchObject({ type: "ack" });
    stats = await statsOf(players[0]!.token);
    expect(stats.games).toBe(1);

    // 重启等价：从数据库重新回放得到的房间状态与在线注册表一致
    const online = ctx.registry.get(room.code);
    const rebuilt = new RoomRegistry(
      new RoomsRepo(ctx.db),
      new ResultsRepo(ctx.db),
      new PlayersRepo(ctx.db),
    ).get(room.code);
    expect(rebuilt.seq).toBe(online.seq);
    expect(rebuilt.state).toEqual(online.state);

    tv.close();
    phones.slice(0, 3).forEach((p) => p.close());
  });

  it("本地玩家：主控台创建并带入座位（即已准备）；他人可离座；非创建者不能入座/改档案", async () => {
    const console_ = await register("主控台");
    const phone = await register("手机");
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: auth(console_.token),
    });
    const { room } = (await created.json()) as { room: RoomView };

    // REST：创建 + 列表
    const add = await app.request("/api/me/locals", {
      method: "POST",
      headers: { ...auth(console_.token), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小明" }),
    });
    expect(add.status).toBe(201);
    const { local } = (await add.json()) as { local: { id: string; name: string; games: number } };
    expect(local).toMatchObject({ name: "小明", games: 0 });
    const list = (await (
      await app.request("/api/me/locals", { headers: auth(console_.token) })
    ).json()) as { locals: Array<{ id: string }> };
    expect(list.locals.map((l) => l.id)).toEqual([local.id]);
    // 别的设备看不到、改不了
    const other = await app.request(`/api/me/locals/${local.id}`, {
      method: "PATCH",
      headers: { ...auth(phone.token), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "冒充" }),
    });
    expect(other.status).toBe(404);

    const tv = new Client(room.code, console_.token);
    const ph = new Client(room.code, phone.token);
    await Promise.all([tv.open(), ph.open()]);
    await tv.waitState(() => true);
    await ph.waitState(() => true);

    // 非创建者不能带本地玩家入座
    ph.send({
      type: "command",
      id: "x",
      baseSeq: 0,
      command: { type: "sitLocal", seat: 0, playerId: local.id },
    });
    expect(await ph.outcome()).toMatchObject({ type: "error", code: "forbidden" });
    // 主控台带入 → 入座即已准备
    tv.send({
      type: "command",
      id: "sl",
      baseSeq: 0,
      command: { type: "sitLocal", seat: 0, playerId: local.id },
    });
    let seq = (await tv.until("ack")).seq;
    let state = await tv.waitState((r) => r.seats[0] !== null);
    expect(state.seats[0]).toMatchObject({ id: local.id, name: "小明" });
    expect(state.ready[0]).toBe(true);
    // 客户端自报 ready 被剥离：设备玩家入座后仍未准备
    ph.send({
      type: "command",
      id: "sit",
      baseSeq: seq,
      command: { type: "sit", seat: 1, ready: true } as never,
    });
    seq = (await ph.until("ack")).seq;
    state = await ph.waitState((r) => r.seats[1] !== null);
    expect(state.ready[1]).toBe(false);
    // 手机可以让本地玩家离座（人人管理员），但不能动别的设备玩家
    ph.send({ type: "command", id: "lv", baseSeq: seq, command: { type: "leave", seat: 0 } });
    seq = (await ph.until("ack")).seq;
    state = await ph.waitState((r) => r.seats[0] === null);
    expect(state.seats[0]).toBeNull();
    // 改名同步进房间：先重新带入
    tv.send({
      type: "command",
      id: "sl2",
      baseSeq: seq,
      command: { type: "sitLocal", seat: 0, playerId: local.id },
    });
    await tv.until("ack");
    const renamed = await app.request(`/api/me/locals/${local.id}`, {
      method: "PATCH",
      headers: { ...auth(console_.token), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小明2" }),
    });
    expect(renamed.status).toBe(200);
    state = await tv.waitState((r) => r.seats[0]?.name === "小明2");
    expect(state.seats[0]?.name).toBe("小明2");
    // 删除档案：204；再删 404
    expect(
      (
        await app.request(`/api/me/locals/${local.id}`, {
          method: "DELETE",
          headers: auth(console_.token),
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await app.request(`/api/me/locals/${local.id}`, {
          method: "DELETE",
          headers: auth(console_.token),
        })
      ).status,
    ).toBe(404);
    tv.close();
    ph.close();
  });

  it("解散房间：发起者先收到 ack 再被断开（4010）；他人断开；REST 410；重连被拒；回放不再进内存", async () => {
    const console_ = await register("主控台");
    const phone = await register("手机");
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: auth(console_.token),
    });
    const { room } = (await created.json()) as { room: RoomView };
    const tv = new Client(room.code, console_.token);
    const ph = new Client(room.code, phone.token);
    await Promise.all([tv.open(), ph.open()]);
    await tv.waitState(() => true);
    await ph.waitState(() => true);
    const closedCodes: number[] = [];
    const phClosed = new Promise<void>((resolve) =>
      ph.socket.addEventListener("close", (e) => {
        closedCodes.push(e.code);
        resolve();
      }),
    );
    const tvClosed = new Promise<number>((resolve) =>
      tv.socket.addEventListener("close", (e) => resolve(e.code)),
    );

    tv.send({ type: "command", id: "d", baseSeq: 0, command: { type: "dissolve" } });
    // ack 必须先于关闭到达
    expect(await tv.outcome()).toMatchObject({ type: "ack", seq: 1 });
    expect(await tvClosed).toBe(4010);
    await phClosed;
    expect(closedCodes).toEqual([4010]);

    const gone = await app.request(`/api/rooms/${room.code}`, { headers: auth(console_.token) });
    expect(gone.status).toBe(410);
    // 重新连接被拒（4010 + room_closed），且不需要回放事件
    const again = new Client(room.code, phone.token);
    await again.open();
    expect(await again.until("error")).toMatchObject({ code: "room_closed" });
    expect(() => ctx.registry.get(room.code)).toThrow(/已解散/);
  });
});
