import { describe, expect, it } from "vitest";
import { describeEntry } from "../format/describe";
import { DomainError } from "../progress/advance";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { Command } from "../types/commands";
import type { RoomEvent } from "../types/events";
import type { PlayerRef, RoomState } from "../types/state";
import { createRoom, reduceRoom, replay } from "./reduce";

const players: PlayerRef[] = [
  { id: "a", name: "阿东", avatar: null },
  { id: "b", name: "阿南", avatar: null },
  { id: "c", name: "阿西", avatar: null },
  { id: "d", name: "阿北", avatar: null },
];

function events(commands: Command[], startAt = 1_000): RoomEvent[] {
  return commands.map((command, i) => ({
    seq: i + 1,
    at: startAt + i * 60_000,
    actor: { playerId: null, clientId: "test" },
    command,
  }));
}

function lobbyCommands(force = false): Command[] {
  return [
    ...players.map((player, seat): Command => ({
      type: "sit",
      seat: seat as 0 | 1 | 2 | 3,
      player,
    })),
    ...players.map((_, seat): Command => ({
      type: "setReady",
      seat: seat as 0 | 1 | 2 | 3,
      ready: true,
    })),
    { type: "start", force },
  ];
}

function startedRoom(): RoomState {
  return replay(createRoom("ABC123", MLEAGUE_RULES), events(lobbyCommands()));
}

const manual = (han: number, fu: number) => ({ kind: "manual" as const, han, fu, yakuman: 0 });

describe("reduceRoom / lobby", () => {
  it("四人入座准备后开局，点数为起始点", () => {
    const room = startedRoom();
    expect(room.phase).toBe("playing");
    expect(room.game?.present.points).toEqual([25000, 25000, 25000, 25000]);
    expect(room.game?.present.startedAt).toBe(1_000 + 8 * 60_000);
  });
  it("未全员准备不能开局，主控台可强开", () => {
    const base = replay(createRoom("X", MLEAGUE_RULES), events(lobbyCommands().slice(0, 4)));
    const start = (force: boolean): RoomEvent => ({
      seq: 99,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "start", force },
    });
    expect(() => reduceRoom(base, start(false))).toThrow(DomainError);
    expect(reduceRoom(base, start(true)).phase).toBe("playing");
  });
  it("开局后规则锁定", () => {
    const room = startedRoom();
    expect(() =>
      reduceRoom(room, {
        seq: 50,
        at: 0,
        actor: { playerId: null, clientId: "t" },
        command: { type: "setRules", rules: MLEAGUE_RULES },
      }),
    ).toThrow(/开局后/);
  });
  it("同一玩家换座会离开原座位", () => {
    const room = replay(
      createRoom("X", MLEAGUE_RULES),
      events([
        { type: "sit", seat: 0, player: players[0]! },
        { type: "sit", seat: 2, player: players[0]! },
      ]),
    );
    expect(room.seats[0]).toBeNull();
    expect(room.seats[2]?.id).toBe("a");
  });
});

describe("reduceRoom / 整局回放", () => {
  const game: Command[] = [
    // 东1：庄家(0) 自摸 3番30符 → 2000 all，连庄
    { type: "tsumo", winner: 0, value: manual(3, 30), riichi: [0] },
    // 东1 1本场：闲家 1 荣和 2，2番30符 + 本场 300；立直 1
    { type: "ron", loser: 2, wins: [{ winner: 1, value: manual(2, 30) }], riichi: [1] },
    // 东2：流局，2、3 听牌，3 立直
    { type: "draw", tenpai: [false, false, true, true], riichi: [3], nagashi: [] },
    // 东3 1本场：闲家 0 自摸 满贯 4番40符，收场供 1 棒
    { type: "tsumo", winner: 0, value: manual(4, 40), riichi: [] },
    // 东4：庄家 3 荣和 0 跳满
    { type: "ron", loser: 0, wins: [{ winner: 3, value: manual(6, 30) }], riichi: [] },
    // 东4 1本场：闲家 1 荣和 3 满贯
    { type: "ron", loser: 3, wins: [{ winner: 1, value: manual(5, 30) }], riichi: [] },
    // 南1：流局 全员不听
    { type: "draw", tenpai: [false, false, false, false], riichi: [], nagashi: [] },
    // 南2 1本场：闲家 2 自摸 倍满
    { type: "tsumo", winner: 2, value: manual(8, 30), riichi: [2] },
    // 南3：闲家 0 荣和 1 三倍满
    { type: "ron", loser: 1, wins: [{ winner: 0, value: manual(11, 30) }], riichi: [] },
    // 南4：闲家 0 荣和 3 1番30符 → 终局
    { type: "ron", loser: 3, wins: [{ winner: 0, value: manual(1, 30) }], riichi: [] },
  ];

  it("点数守恒且终局结果正确", () => {
    const room = replay(startedRoom(), events(game, 10_000_000));
    const g = room.game!.present;
    expect(room.phase).toBe("finished");
    expect(g.status).toBe("finished");
    expect(g.points.reduce((a, b) => a + b, 0)).toBe(100000);
    // 逐局手算：
    // 东1: 0:+6000-1000(立直)+1000(收回) = 31000, 其余 23000
    // 东1 1本場: 1 荣和 2: 2000+300=2300, 1 立直 -1000 +1000; 1: 25300, 2: 20700, 0: 31000, 3: 23000
    // 东2: 流局 2,3 听牌: 0,1 各 -1500; 2,3 各 +1500; 3 立直 -1000 → 0: 29500, 1: 23800, 2: 22200, 3: 23500, 场供 1
    // 东3 1本場: 0 自摸满贯 闲家: 庄(2) 4000+100, 闲 2000+100 ×2 + 场供 1000 → 0: 29500+4100+2100+2100+1000 = 38800, 1: 21700, 2: 18100, 3: 21400
    // 东4: 庄 3 荣和 0 跳满 18000 → 3: 39400, 0: 20800
    // 东4 1本場: 1 荣和 3 满贯 8000+300 → 1: 30000, 3: 31100
    // 南1: 全不听 无变化, 本场 1
    // 南2 1本場: 2 自摸倍满 闲家: 庄(1) 8000+100, 闲 4000+100 ×2, 2 立直 -1000 +1000 → 2: 18100+8100+4100+4100 = 34400, 1: 21900, 0: 16700, 3: 27000
    // 南3: 0 荣和 1 三倍满 24000 → 0: 40700, 1: -2100
    // 南4: 0 荣和 3 1000 → 0: 41700, 3: 26000
    expect(g.points).toEqual([41700, -2100, 34400, 26000]);
    expect(g.final?.ranks).toEqual([1, 4, 2, 3]);
    // uma: 一位 30+20=50, 二位 10, 三位 -10, 四位 -30
    expect(g.final?.scores).toEqual([61.7, -62.1, 14.4, -14]);
    expect(g.history).toHaveLength(10);
    expect(g.finishedAt).toBe(10_000_000 + 9 * 60_000);
  });

  it("回放确定性：同一事件流两次回放深等", () => {
    const a = replay(startedRoom(), events(game));
    const b = replay(startedRoom(), events(game));
    expect(a).toEqual(b);
  });

  it("撤销/重做", () => {
    const evs = events(game);
    const room = replay(startedRoom(), evs.slice(0, 3));
    const undone = reduceRoom(room, {
      seq: 100,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "undo" },
    });
    expect(undone.game!.present.history).toHaveLength(2);
    expect(undone.game!.past).toHaveLength(2);
    const redone = reduceRoom(undone, {
      seq: 101,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "redo" },
    });
    expect(redone).toEqual({ ...room, game: { ...room.game, future: [] } });
    // 撤销到底后再撤销报错
    const bottom = replay(room, events([{ type: "undo" }, { type: "undo" }, { type: "undo" }], 5));
    expect(() =>
      reduceRoom(bottom, {
        seq: 200,
        at: 0,
        actor: { playerId: null, clientId: "t" },
        command: { type: "undo" },
      }),
    ).toThrow(/暂无可撤销/);
  });

  it("终局后撤销可回到进行中", () => {
    const room = replay(startedRoom(), events(game));
    const undone = reduceRoom(room, {
      seq: 100,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "undo" },
    });
    expect(undone.phase).toBe("playing");
    expect(undone.game!.present.final).toBeNull();
  });

  it("历史描述沿用旧措辞", () => {
    const room = replay(startedRoom(), events(game.slice(0, 3)));
    const [draw, ron, tsumo] = room.game!.present.history;
    expect(describeEntry(tsumo!)).toBe(
      "庄家 阿东 自摸 3 番 30 符，闲家各支付 2,000 点，本局立直供托收入 1,000 点，共收入 6,000 点。",
    );
    expect(describeEntry(ron!)).toBe(
      "闲家 阿南 荣和 阿西 2 番 30 符，共 2,300 点（其中 300 点为本场棒），本局立直供托收入 1,000 点，共收入 2,300 点。",
    );
    expect(describeEntry(draw!)).toBe(
      "流局，本局立直供托计入场供 1,000 点，听牌：阿西、阿北，未听牌：阿东、阿南。",
    );
  });

  it("头跳规则拒绝双响", () => {
    const room = startedRoom();
    expect(() =>
      reduceRoom(room, {
        seq: 9,
        at: 0,
        actor: { playerId: null, clientId: "t" },
        command: {
          type: "ron",
          loser: 0,
          wins: [
            { winner: 1, value: manual(1, 30) },
            { winner: 2, value: manual(1, 30) },
          ],
          riichi: [],
        },
      }),
    ).toThrow(/头跳/);
  });

  it("双响：供托归离放铳者最近者，本场各得", () => {
    const rules = { ...MLEAGUE_RULES, win: { multiRon: "double" as const } };
    const room = replay(createRoom("D", rules), events(lobbyCommands()));
    const withKyotaku = reduceRoom(room, {
      seq: 20,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "draw", tenpai: [true, true, true, true], riichi: [0], nagashi: [] },
    });
    // 东1 1本场，场供 1；放铳者 2，和牌者 3 与 1：3 是 2 的下家 → 3 收供托
    const next = reduceRoom(withKyotaku, {
      seq: 21,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: {
        type: "ron",
        loser: 2,
        wins: [
          { winner: 3, value: manual(1, 30) },
          { winner: 1, value: manual(1, 30) },
        ],
        riichi: [],
      },
    });
    const entry = next.game!.present.history[0]!;
    expect(entry.deltas).toEqual([0, 1300, -2600, 1300 + 1000]);
  });

  it("调整场况可撤销", () => {
    const room = startedRoom();
    const adjusted = reduceRoom(room, {
      seq: 30,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "adjust", kyoku: 5, honba: 2, dealer: 1 },
    });
    expect([
      adjusted.game!.present.kyoku,
      adjusted.game!.present.honba,
      adjusted.game!.present.dealer,
    ]).toEqual([5, 2, 1]);
    const undone = reduceRoom(adjusted, {
      seq: 31,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "undo" },
    });
    expect(undone.game!.present.kyoku).toBe(0);
  });

  it("重开一局清空撤销栈并回到东1", () => {
    const room = replay(startedRoom(), events(game));
    const fresh = reduceRoom(room, {
      seq: 100,
      at: 777,
      actor: { playerId: null, clientId: "t" },
      command: { type: "newGame" },
    });
    expect(fresh.phase).toBe("playing");
    expect(fresh.game!.past).toHaveLength(0);
    expect(fresh.game!.present.startedAt).toBe(777);
    expect(fresh.gameNo).toBe(2);
  });
});
