import { describe, expect, it } from "vitest";
import { describeEntry } from "../format/describe";
import { DomainError } from "../progress/advance";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { Command } from "../types/commands";
import type { RoomEvent } from "../types/events";
import type { PlayerRef, RoomState } from "../types/state";
import { createRoom, reduceRoom, replay } from "./reduce";

const players: PlayerRef[] = [
  { id: "a", name: "阿东", avatar: null, kind: "device" },
  { id: "b", name: "阿南", avatar: null, kind: "device" },
  { id: "c", name: "阿西", avatar: null, kind: "device" },
  { id: "d", name: "阿北", avatar: null, kind: "device" },
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
  it("终局回大厅：本地玩家保持已准备，设备玩家需重新准备", () => {
    const local: PlayerRef = { id: "l", name: "本地", avatar: null, kind: "local" };
    const cmds = lobbyCommands(true);
    cmds[3] = { type: "sit", seat: 3, player: local, ready: true };
    const room = replay(createRoom("X", MLEAGUE_RULES), events(cmds));
    expect(room.phase).toBe("playing");
    const at = (seq: number, command: Command): RoomEvent => ({
      seq,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command,
    });
    const finished = reduceRoom(room, at(90, { type: "endGame" }));
    const lobby = reduceRoom(finished, at(91, { type: "toLobby" }));
    expect(lobby.phase).toBe("lobby");
    expect(lobby.ready).toEqual([false, false, false, true]);
  });
  it("改规则带 resetReady：清设备玩家准备，本地玩家保持", () => {
    const local: PlayerRef = { id: "l", name: "本地", avatar: null, kind: "local" };
    const cmds = lobbyCommands().slice(0, 8);
    cmds[3] = { type: "sit", seat: 3, player: local, ready: true };
    const room = replay(createRoom("X", MLEAGUE_RULES), events(cmds));
    expect(room.ready).toEqual([true, true, true, true]);
    const rules = { ...MLEAGUE_RULES, scoring: { ...MLEAGUE_RULES.scoring, kiriageMangan: false } };
    const next = reduceRoom(room, {
      seq: 9,
      at: 0,
      actor: { playerId: null, clientId: "t" },
      command: { type: "setRules", rules, resetReady: true },
    });
    expect(next.rules.scoring.kiriageMangan).toBe(false);
    expect(next.ready).toEqual([false, false, false, true]);
  });
  it("旧事件（改规则无 resetReady）回放语义不变：准备后改规则仍可开局", () => {
    // 规则确有变化、但事件里没有 resetReady（改动前写下的事件）：准备保持，照常开局
    const rules = { ...MLEAGUE_RULES, scoring: { ...MLEAGUE_RULES.scoring, kiriageMangan: false } };
    const cmds = lobbyCommands();
    cmds.splice(8, 0, { type: "setRules", rules });
    const lobby = replay(createRoom("X", MLEAGUE_RULES), events(cmds.slice(0, 9)));
    expect(lobby.ready).toEqual([true, true, true, true]);
    const room = replay(createRoom("X", MLEAGUE_RULES), events(cmds));
    expect(room.phase).toBe("playing");
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

  it("对自己已占的座位重复入座是空操作（不清准备、返回同一对象）", () => {
    const seated = replay(
      createRoom("X", MLEAGUE_RULES),
      events([
        { type: "sit", seat: 1, player: players[0]! },
        { type: "setReady", seat: 1, ready: true },
      ]),
    );
    const again = reduceRoom(seated, {
      seq: 3,
      at: 3,
      actor: { playerId: "a", clientId: "c" },
      command: { type: "sit", seat: 1, player: players[0]! },
    });
    expect(again).toBe(seated);
    expect(again.ready[1]).toBe(true);
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
      command: { type: "adjust", kyoku: 5, honba: 2 },
    });
    expect([adjusted.game!.present.kyoku, adjusted.game!.present.honba]).toEqual([5, 2]);
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

describe("reduceRoom / 立直声明", () => {
  let seq = 100;
  const apply = (room: RoomState, command: Command): RoomState =>
    reduceRoom(room, { seq: seq++, at: 0, actor: { playerId: null, clientId: "t" }, command });
  /** 按下时看到的就是当前局面 */
  const declare = (room: RoomState, seat: 0 | 1 | 2 | 3): Command => {
    const g = room.game!.present;
    return {
      type: "declareRiichi",
      seat,
      kyoku: g.kyoku,
      honba: g.honba,
      entries: g.history.length,
    };
  };

  it("声明只置位本局状态：幂等、不扣点、不入撤销栈", () => {
    const room = startedRoom();
    const declared = apply(room, declare(room, 1));
    expect(declared.game!.present.riichi).toEqual([false, true, false, false]);
    expect(declared.game!.present.points).toEqual(room.game!.present.points);
    expect(declared.game!.past).toHaveLength(0);
    expect(apply(declared, declare(declared, 1))).toBe(declared);
  });

  it("点数不足 1000 且规则不允许时拒绝", () => {
    const room = startedRoom();
    const strict = { ...room.rules.progress, riichiBelow1000: false };
    const poor = {
      ...room,
      rules: { ...room.rules, progress: strict },
      game: {
        ...room.game!,
        present: { ...room.game!.present, points: [500, 25000, 25000, 49500] },
      },
    };
    expect(() => apply(poor, declare(poor, 0))).toThrow(/不足 1000/);
    const lenient = {
      ...poor,
      rules: { ...poor.rules, progress: { ...poor.rules.progress, riichiBelow1000: true } },
    };
    expect(apply(lenient, declare(lenient, 0)).game!.present.riichi[0]).toBe(true);
  });

  it("结算后清空；撤销结算后声明随快照回来；重做再次清空", () => {
    const started = startedRoom();
    let room = apply(started, declare(started, 2));
    room = apply(room, { type: "tsumo", winner: 0, value: manual(3, 30), riichi: [2] });
    expect(room.game!.present.riichi).toEqual([false, false, false, false]);
    room = apply(room, { type: "undo" });
    expect(room.game!.present.riichi).toEqual([false, false, true, false]);
    room = apply(room, { type: "redo" });
    expect(room.game!.present.riichi).toEqual([false, false, false, false]);
  });

  it("流局与途中流局同样清空；调整场况只在局数或本场变化时清", () => {
    const started = startedRoom();
    const declared = apply(started, declare(started, 0));
    const drawn = apply(declared, {
      type: "draw",
      tenpai: [true, false, false, false],
      riichi: [0],
      nagashi: [],
    });
    expect(drawn.game!.present.riichi).toEqual([false, false, false, false]);
    const withAbortive = {
      ...declared,
      rules: { ...declared.rules, progress: { ...declared.rules.progress, abortiveDraws: true } },
    };
    const aborted = apply(withAbortive, { type: "abortive", reason: "kyuushu", riichi: [0] });
    expect(aborted.game!.present.riichi).toEqual([false, false, false, false]);
    const same = apply(declared, { type: "adjust", kyoku: 0, honba: 0 });
    expect(same.game!.present.riichi).toEqual([true, false, false, false]);
    const moved = apply(declared, { type: "adjust", kyoku: 1, honba: 0 });
    expect(moved.game!.present.riichi).toEqual([false, false, false, false]);
  });

  it("按下时看到的局面已经变了（别人刚记了一笔）：拒绝，不落到下一局", () => {
    const room = startedRoom();
    const pressed = declare(room, 1);
    const next = apply(room, { type: "tsumo", winner: 0, value: manual(3, 30), riichi: [] });
    expect(() => apply(next, pressed)).toThrow(/局面已变化/);
  });

  it("终局后不能声明", () => {
    const finished = apply(startedRoom(), { type: "endGame" });
    expect(() => apply(finished, declare(finished, 0))).toThrow(/已结束/);
  });
});
