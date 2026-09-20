import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MLEAGUE_RULES,
  type HandInput,
  type RoomView,
  type ServerMessage,
  type TenRoomView,
} from "@riichi/core";
import { openDatabase } from "../db";
import { PlayersRepo } from "../db/players";
import { ResultsRepo } from "../db/results";
import { RoomsRepo } from "../db/rooms";
import { RoomRegistry, type LiveRoom, type RoomClient } from "./registry";

function fakeClient(
  playerId: string,
): RoomClient & { states: RoomView[]; messages: ServerMessage[] } {
  const states: RoomView[] = [];
  const messages: ServerMessage[] = [];
  return {
    clientId: `c-${playerId}-${Math.random().toString(36).slice(2, 6)}`,
    playerId,
    name: playerId,
    states,
    messages,
    send(m) {
      const msg = JSON.parse(m) as ServerMessage;
      messages.push(msg);
      if (msg.type === "state") states.push(msg.room);
    },
    close() {},
  };
}

const AUTO_MS = 3000;
const MIN = 60_000;

/** 副露西风刻子 + 自摸，唯一的役是「自风 西」：只有场况算对（闲家 = 西）才成和 */
const WEST_ONLY: HandInput = {
  closed: [2, 3, 4, 14, 15, 16, 21, 22, 23, 20, 20],
  melds: [{ open: true, tiles: [30, 30, 30] }],
  winTile: 4,
  tsumo: true,
  doraIndicators: [],
  uraIndicators: [],
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  afterKan: false,
  lastTile: false,
  firstTake: false,
};

describe("二人房（《天》规则）", () => {
  let db: ReturnType<typeof openDatabase>;
  let roomsRepo: RoomsRepo;
  let players: PlayersRepo;
  let registry: RoomRegistry;
  let room: LiveRoom;
  let now = 1_000_000;

  const build = () => new RoomRegistry(roomsRepo, new ResultsRepo(db), players, () => now, AUTO_MS);
  /** 墙上时钟与定时器一起走 */
  const advance = (ms: number) => {
    now += ms;
    vi.advanceTimersByTime(ms);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    now = 1_000_000;
    db = openDatabase(":memory:");
    roomsRepo = new RoomsRepo(db);
    players = new PlayersRepo(db);
    registry = build();
    room = registry.createRoom(MLEAGUE_RULES, "ten");
  });
  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  const actorOf = (c: RoomClient) => ({ playerId: c.playerId, clientId: c.clientId });
  const ten = (v: RoomView): TenRoomView => {
    if (v.kind !== "ten") throw new Error(`expected ten room, got ${v.kind}`);
    return v;
  };
  const last = (c: { states: RoomView[] }) => ten(c.states[c.states.length - 1]!);

  /** 两台手机入座并准备，等自动开局 */
  function start() {
    const phones = ["甲", "乙"].map((n) => fakeClient(players.create(n, now).id));
    phones.forEach((p, seat) => {
      registry.join(room, p);
      registry.apply(room, room.seq, { type: "sit", seat: seat as 0 | 1 }, actorOf(p));
      registry.apply(
        room,
        room.seq,
        { type: "setReady", seat: seat as 0 | 1, ready: true },
        actorOf(p),
      );
    });
    advance(AUTO_MS + 1);
    return phones as [(typeof phones)[number], (typeof phones)[number]];
  }
  const entries = () => (room.state.kind === "ten" ? room.state.game!.present.history.length : 0);

  it("两个座位；两人准备且在线即自动开局；第三个座位不存在", () => {
    expect(registry.view(room)).toMatchObject({ kind: "ten", seats: [null, null], timeMark: 0 });
    const intruder = fakeClient(players.create("丙", now).id);
    expect(() =>
      registry.apply(room, room.seq, { type: "sit", seat: 2 }, actorOf(intruder)),
    ).toThrow(/没有这个座位/);
    const [a] = start();
    expect(last(a)).toMatchObject({ phase: "playing", kind: "ten" });
    expect(last(a).game?.present).toMatchObject({ scores: [0, 0], sticks: [10, 10], dealer: 0 });
  });

  it("宣言只能替自己的座位按；指定与记结果人人可做；和牌按进攻方的场况评估（闲家自风西）", () => {
    const [a, b] = start();
    const declare = { type: "tenDeclare", seat: 1, riichi: false, entries: entries() } as const;
    expect(() => registry.apply(room, room.seq, declare, actorOf(a))).toThrow(/自己的座位/);
    registry.apply(room, room.seq, declare, actorOf(b));
    // 重复的宣言（带着落后的 seq 也一样）不落库、不推进 seq
    const seq = room.seq;
    registry.apply(room, seq - 1, declare, actorOf(b));
    expect(room.seq).toBe(seq);

    registry.apply(room, room.seq, { type: "tenGuess", tiles: [1, 9] }, actorOf(a));
    expect(last(a).game?.present.stage).toMatchObject({ attacker: 1, guesses: [[1, 9]] });

    // 西家的副露手：自风西是唯一的役。按四人座位的算法 1 号位是南家，会被判无役
    registry.apply(
      room,
      room.seq,
      { type: "tenTsumo", value: { kind: "hand", hand: WEST_ONLY } },
      actorOf(a),
    );
    const game = last(a).game!.present;
    // 闲家 1 番 30 符自摸 300 / 500 → 1100；换庄
    expect(game).toMatchObject({ scores: [0, 1100], dealer: 1, honba: 0, stage: { kind: "A" } });
    expect(game.history[0]).toMatchObject({ kind: "tenTsumo", winner: 1, gain: 1100 });
    expect(game.history[0]).toHaveProperty("hand.winTile", 4);

    // 换庄之后同一手牌由东家（现在的闲家）和：自风是西，仍然成和
    registry.apply(
      room,
      room.seq,
      { type: "tenDeclare", seat: 0, riichi: false, entries: entries() },
      actorOf(a),
    );
    registry.apply(
      room,
      room.seq,
      { type: "tenTsumo", value: { kind: "hand", hand: WEST_ONLY } },
      actorOf(b),
    );
    expect(last(a).game!.present.scores).toEqual([1100, 1100]);
  });

  it("Stage A 不能和牌：未评估的牌面到不了 reducer", () => {
    const [a] = start();
    expect(() =>
      registry.apply(
        room,
        room.seq,
        { type: "tenTsumo", value: { kind: "hand", hand: WEST_ONLY } },
        actorOf(a),
      ),
    ).toThrow(/还没有人宣言/);
  });

  it("撤销宣言 / 指定会广播是哪一步；终局不写个人战绩", () => {
    const [a, b] = start();
    registry.apply(
      room,
      room.seq,
      { type: "tenDeclare", seat: 0, riichi: true, entries: entries() },
      actorOf(a),
    );
    registry.apply(room, room.seq, { type: "tenGuess", tiles: [1, 2] }, actorOf(b));
    registry.apply(room, room.seq, { type: "undo" }, actorOf(b));
    registry.apply(room, room.seq, { type: "undo" }, actorOf(b));
    const reverted = a.messages.filter((m) => m.type === "reverted").map((m) => m.what);
    expect(reverted).toEqual(["第 1 轮指定", "甲的立直"]);
    expect(last(a).game?.present).toMatchObject({ sticks: [10, 10], stage: { kind: "A" } });

    registry.apply(room, room.seq, { type: "endGame" }, actorOf(a));
    expect(last(a).phase).toBe("finished");
    expect(db.prepare("SELECT COUNT(*) AS n FROM game_results").get()).toEqual({ n: 0 });
  });

  it("暗计时：剩 10 分 / 剩 5 分 / 时间到各广播一次档位，不下发剩余时间，也不自动终局", () => {
    const [a] = start();
    const marks = () => a.states.map((s) => ten(s).timeMark);
    advance(49 * MIN);
    expect(last(a).timeMark).toBe(0);
    const before = a.states.length;
    advance(MIN);
    expect(a.states.length).toBe(before + 1);
    expect(last(a).timeMark).toBe(1);
    advance(5 * MIN);
    expect(last(a).timeMark).toBe(2);
    advance(5 * MIN);
    expect(last(a).timeMark).toBe(3);
    expect(last(a).phase).toBe("playing");
    advance(30 * MIN);
    expect(marks().filter((m, i, all) => m !== all[i - 1])).toEqual([0, 1, 2, 3]);
    expect(JSON.stringify(last(a))).not.toMatch(/remaining|deadline/i);
  });

  it("暗计时跟着局面走：终局后不再提示，撤销终局后接着计；重开一局从头计", () => {
    const [a] = start();
    advance(40 * MIN);
    registry.apply(room, room.seq, { type: "endGame" }, actorOf(a));
    advance(15 * MIN);
    expect(last(a).timeMark).toBe(0);
    registry.apply(room, room.seq, { type: "undo" }, actorOf(a));
    // 撤销回来时已经过了 55 分钟
    expect(last(a).timeMark).toBe(2);
    advance(5 * MIN);
    expect(last(a).timeMark).toBe(3);

    registry.apply(room, room.seq, { type: "endGame" }, actorOf(a));
    registry.apply(room, room.seq, { type: "newGame" }, actorOf(a));
    expect(last(a).timeMark).toBe(0);
    advance(50 * MIN);
    expect(last(a).timeMark).toBe(1);
  });

  it("重启等价：房型随房间行落库，回放后进房的人按开局时刻拿到当前档位", () => {
    const [a, b] = start();
    registry.apply(
      room,
      room.seq,
      { type: "tenDeclare", seat: 0, riichi: true, entries: entries() },
      actorOf(a),
    );
    registry.leave(room, a.clientId);
    registry.leave(room, b.clientId);
    now += 56 * MIN;

    const rebuilt = build();
    const again = rebuilt.get(room.code);
    expect(again.state.kind).toBe("ten");
    // 只是查房（GET /api/rooms/:code）不起定时器
    expect(again.clock).toBeNull();
    const back = fakeClient(a.playerId);
    rebuilt.join(again, back);
    expect(last(back)).toMatchObject({ timeMark: 2 });
    expect(last(back).game?.present).toMatchObject({
      sticks: [9, 10],
      stage: { kind: "B", attacker: 0, riichi: true },
    });
    expect(again.clock?.at).toBe(last(back).game!.present.startedAt + 60 * MIN);
  });
});
