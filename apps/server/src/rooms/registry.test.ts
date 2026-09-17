import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView, ServerMessage } from "@riichi/core";
import { openDatabase } from "../db";
import { PlayersRepo } from "../db/players";
import { ResultsRepo } from "../db/results";
import { RoomsRepo } from "../db/rooms";
import { MLEAGUE_RULES } from "@riichi/core";
import { RoomRegistry, type LiveRoom, type RoomClient } from "./registry";

/** 假客户端：收集广播，供断言最后一次状态。 */
function fakeClient(playerId: string): RoomClient & { states: RoomView[] } {
  const states: RoomView[] = [];
  return {
    clientId: `c-${playerId}-${Math.random().toString(36).slice(2, 6)}`,
    playerId,
    name: playerId,
    states,
    send(m) {
      const msg = JSON.parse(m) as ServerMessage;
      if (msg.type === "state") states.push(msg.room);
    },
    close() {},
  };
}

const AUTO_MS = 3000;

describe("RoomRegistry：在线状态、离线座位回收、自动开局", () => {
  let registry: RoomRegistry;
  let players: PlayersRepo;
  let room: LiveRoom;
  let db: ReturnType<typeof openDatabase>;
  const now = 1_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    db = openDatabase(":memory:");
    players = new PlayersRepo(db);
    registry = new RoomRegistry(
      new RoomsRepo(db),
      new ResultsRepo(db),
      players,
      () => now,
      AUTO_MS,
    );
    room = registry.createRoom(MLEAGUE_RULES);
  });
  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  const device = (name: string) => players.create(name, now);
  const actorOf = (c: RoomClient) => ({ playerId: c.playerId, clientId: c.clientId });
  const last = (c: { states: RoomView[] }) => c.states[c.states.length - 1]!;

  it("join/leave 广播在线状态；离线的设备玩家任何人可请离，在线时不行，准备永远不能代做", () => {
    const a = fakeClient(device("甲").id);
    const b = fakeClient(device("乙").id);
    registry.join(room, a);
    registry.join(room, b);
    registry.apply(room, room.seq, { type: "sit", seat: 0 }, actorOf(a));
    expect(last(b).online).toEqual([true, false, false, false]);

    // 甲在线：乙不能请离
    expect(() => registry.apply(room, room.seq, { type: "leave", seat: 0 }, actorOf(b))).toThrow(
      /自己的座位/,
    );

    // 甲断线：所有人收到 online=false，乙可以请离；但不能替甲准备
    registry.leave(room, a.clientId);
    expect(last(b).online).toEqual([false, false, false, false]);
    expect(() =>
      registry.apply(room, room.seq, { type: "setReady", seat: 0, ready: true }, actorOf(b)),
    ).toThrow(/自己的座位/);
    registry.apply(room, room.seq, { type: "leave", seat: 0 }, actorOf(b));
    expect(last(b).seats[0]).toBeNull();
  });

  it("改规则：规则确有变化才补 resetReady 清设备玩家准备；相同规则不动准备", () => {
    const a = fakeClient(device("甲").id);
    registry.join(room, a);
    registry.apply(room, room.seq, { type: "sit", seat: 0 }, actorOf(a));
    registry.apply(room, room.seq, { type: "setReady", seat: 0, ready: true }, actorOf(a));

    const same = registry.apply(
      room,
      room.seq,
      { type: "setRules", rules: MLEAGUE_RULES },
      actorOf(a),
    );
    expect(same.command).toEqual({ type: "setRules", rules: MLEAGUE_RULES });
    expect(last(a).ready[0]).toBe(true);

    const rules = { ...MLEAGUE_RULES, scoring: { ...MLEAGUE_RULES.scoring, kiriageMangan: false } };
    const changed = registry.apply(room, room.seq, { type: "setRules", rules }, actorOf(a));
    expect(changed.command).toMatchObject({ type: "setRules", resetReady: true });
    expect(last(a).ready[0]).toBe(false);
  });

  it("baseSeq 落后：座位类命令照常执行（广播还没到就点按钮），牌局类仍然拒绝", () => {
    const a = fakeClient(device("甲").id);
    const b = fakeClient(device("乙").id);
    registry.join(room, a);
    registry.join(room, b);
    // 乙手里的 seq 停在甲入座之前
    const stale = room.seq;
    registry.apply(room, room.seq, { type: "sit", seat: 0 }, actorOf(a));
    expect(room.seq).toBe(stale + 1);

    registry.apply(room, stale, { type: "sit", seat: 1 }, actorOf(b));
    expect(last(b).seats[1]?.id).toBe(b.playerId);
    registry.apply(room, stale, { type: "setReady", seat: 1, ready: true }, actorOf(b));
    expect(last(b).ready[1]).toBe(true);
    registry.apply(room, stale, { type: "leave", seat: 1 }, actorOf(b));
    expect(last(b).seats[1]).toBeNull();

    // 豁免的是 baseSeq，不是鉴权：甲在线时乙仍然请不动甲的座位
    expect(() => registry.apply(room, stale, { type: "leave", seat: 0 }, actorOf(b))).toThrow(
      /自己的座位/,
    );

    expect(() => registry.apply(room, stale, { type: "undo" }, actorOf(a))).toThrow(/已更新/);
    expect(() =>
      registry.apply(room, stale, { type: "setRules", rules: MLEAGUE_RULES }, actorOf(a)),
    ).toThrow(/已更新/);
  });

  it("全员准备且在线 → 3 s 后自动开局；中途取消准备则取消；全本地不触发", () => {
    const tv = fakeClient(device("主控台").id);
    registry.join(room, tv);
    const phones = ["甲", "乙"].map((n) => fakeClient(device(n).id));
    for (const p of phones) registry.join(room, p);
    const locals = ["丙", "丁"].map((n) => players.createLocal(n, tv.playerId, now));
    registry.apply(room, room.seq, { type: "sit", seat: 0 }, actorOf(phones[0]!));
    registry.apply(room, room.seq, { type: "sit", seat: 1 }, actorOf(phones[1]!));
    registry.apply(
      room,
      room.seq,
      { type: "sitLocal", seat: 2, playerId: locals[0]!.id },
      actorOf(tv),
    );
    registry.apply(
      room,
      room.seq,
      { type: "sitLocal", seat: 3, playerId: locals[1]!.id },
      actorOf(tv),
    );
    registry.apply(room, room.seq, { type: "setReady", seat: 0, ready: true }, actorOf(phones[0]!));
    expect(last(tv).autoStartIn).toBeNull();
    registry.apply(room, room.seq, { type: "setReady", seat: 1, ready: true }, actorOf(phones[1]!));
    expect(last(tv).autoStartIn).toBe(AUTO_MS);

    // 取消准备 → 倒计时取消，到点不开
    registry.apply(
      room,
      room.seq,
      { type: "setReady", seat: 1, ready: false },
      actorOf(phones[1]!),
    );
    expect(last(tv).autoStartIn).toBeNull();
    vi.advanceTimersByTime(AUTO_MS + 1);
    expect(room.state.phase).toBe("lobby");

    // 再次准备 → 到点开局，事件流多一条系统 start
    registry.apply(room, room.seq, { type: "setReady", seat: 1, ready: true }, actorOf(phones[1]!));
    vi.advanceTimersByTime(AUTO_MS + 1);
    expect(room.state.phase).toBe("playing");
    expect(last(tv).autoStartIn).toBeNull();
  });

  it("有设备玩家掉线时不开局；全是本地玩家时不自动开局", () => {
    const tv = fakeClient(device("主控台").id);
    registry.join(room, tv);
    const phone = fakeClient(device("甲").id);
    registry.join(room, phone);
    const locals = ["乙", "丙", "丁"].map((n) => players.createLocal(n, tv.playerId, now));
    registry.apply(room, room.seq, { type: "sit", seat: 0 }, actorOf(phone));
    locals.forEach((l, i) =>
      registry.apply(
        room,
        room.seq,
        { type: "sitLocal", seat: (i + 1) as 1 | 2 | 3, playerId: l.id },
        actorOf(tv),
      ),
    );
    registry.apply(room, room.seq, { type: "setReady", seat: 0, ready: true }, actorOf(phone));
    expect(last(tv).autoStartIn).toBe(AUTO_MS);
    registry.leave(room, phone.clientId);
    expect(last(tv).autoStartIn).toBeNull();
    vi.advanceTimersByTime(AUTO_MS + 1);
    expect(room.state.phase).toBe("lobby");

    // 换成四个本地玩家：满座全准备也不自动开
    registry.apply(room, room.seq, { type: "leave", seat: 0 }, actorOf(tv));
    const fourth = players.createLocal("戊", tv.playerId, now);
    registry.apply(room, room.seq, { type: "sitLocal", seat: 0, playerId: fourth.id }, actorOf(tv));
    expect(room.state.ready).toEqual([true, true, true, true]);
    expect(last(tv).autoStartIn).toBeNull();
  });
});
