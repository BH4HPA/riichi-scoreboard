import { describe, expect, it } from "vitest";
import { createRoom, reduceRoom, replay } from "../reducer/reduce";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { Command } from "../types/commands";
import { DomainError } from "../types/errors";
import type { RoomEvent } from "../types/events";
import type { HandInput, PlayerRef, TenRoomState, WinValue } from "../types/state";
import { TEN_STICKS } from "./state";

const players: PlayerRef[] = [
  { id: "a", name: "阿东", avatar: null, kind: "device" },
  { id: "b", name: "阿西", avatar: null, kind: "device" },
];

let clock = 0;
function event(command: Command, seq: number): RoomEvent {
  clock += 60_000;
  return { seq, at: clock, actor: { playerId: null, clientId: "test" }, command };
}

function apply(room: TenRoomState, ...commands: Command[]): TenRoomState {
  return commands.reduce((r, c, i) => reduceRoom(r, event(c, 1000 + i)), room);
}

function started(): TenRoomState {
  const lobby: Command[] = [
    { type: "sit", seat: 0, player: players[0]! },
    { type: "sit", seat: 1, player: players[1]! },
    { type: "setReady", seat: 0, ready: true },
    { type: "setReady", seat: 1, ready: true },
    { type: "start", force: false },
  ];
  return replay(
    createRoom("TEN123", MLEAGUE_RULES, "ten"),
    lobby.map((c, i) => event(c, i + 1)),
  );
}

const present = (room: TenRoomState) => room.game!.present;
const manual = (han: number, fu: number): WinValue => ({ kind: "manual", han, fu, yakuman: 0 });
const declare = (room: TenRoomState, seat: 0 | 1, riichi: boolean): Command => ({
  type: "tenDeclare",
  seat,
  riichi,
  entries: present(room).history.length,
});
const guess = (a: number, b: number): Command => ({ type: "tenGuess", tiles: [a, b] });

function handValue(patch: Partial<HandInput>): WinValue {
  const hand: HandInput = {
    closed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 31, 31],
    melds: [],
    winTile: 31,
    tsumo: true,
    doraIndicators: [],
    uraIndicators: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    afterKan: false,
    lastTile: false,
    firstTake: false,
    ...patch,
  };
  return {
    kind: "hand",
    hand,
    result: { han: 3, fu: 30, yakuman: 0, yaku: {}, isAgari: true },
  };
}

describe("二人房 / 大厅", () => {
  it("只有两个座位：第三个座位不存在，两人坐满即可开局", () => {
    const room = createRoom("TEN123", MLEAGUE_RULES, "ten");
    expect(room.seats).toEqual([null, null]);
    expect(() => reduceRoom(room, event({ type: "sit", seat: 2, player: players[0]! }, 1))).toThrow(
      /没有这个座位/,
    );
    const one = reduceRoom(room, event({ type: "sit", seat: 0, player: players[0]! }, 1));
    expect(() => reduceRoom(one, event({ type: "start", force: true }, 2))).toThrow(/两个座位/);
  });

  it("开局：得分 0、各 10 根立直棒、起家坐庄、Stage A", () => {
    const game = present(started());
    expect(game.scores).toEqual([0, 0]);
    expect(game.sticks).toEqual([TEN_STICKS, TEN_STICKS]);
    expect(game).toMatchObject({ dealer: 0, honba: 0, round: 1, stage: { kind: "A" } });
  });

  it("两种房型的对局命令互不相通", () => {
    const ten = started();
    expect(() =>
      apply(ten, { type: "tsumo", winner: 0, value: manual(3, 30), riichi: [] }),
    ).toThrow(/四人麻将/);
    expect(() =>
      apply(ten, { type: "declareRiichi", seat: 0, kyoku: 0, honba: 0, entries: 0 }),
    ).toThrow(/四人麻将/);
    const yonma = createRoom("Y", MLEAGUE_RULES);
    const four = ["a", "b", "c", "d"].map((id) => ({ id, name: id, avatar: null }));
    const playing = replay(yonma, [
      ...four.map((player, i) => event({ type: "sit", seat: i as 0 | 1 | 2 | 3, player }, i + 1)),
      event({ type: "start", force: true }, 9),
    ]);
    expect(() => reduceRoom(playing, event(guess(1, 2), 10))).toThrow(/二人麻将/);
  });
});

describe("二人房 / Stage A → B", () => {
  it("立直宣言扣 1 根立直棒并进入 Stage B；听牌宣言不扣", () => {
    const room = started();
    const riichi = apply(room, declare(room, 0, true));
    expect(present(riichi).sticks).toEqual([9, 10]);
    expect(present(riichi).stage).toEqual({ kind: "B", attacker: 0, riichi: true, guesses: [] });
    const tenpai = apply(room, declare(room, 1, false));
    expect(present(tenpai).sticks).toEqual([10, 10]);
    expect(present(tenpai).stage).toMatchObject({ attacker: 1, riichi: false });
  });

  it("重复的宣言没有状态变化（同一个对象）；对方后到得到「对方已宣言」", () => {
    const room = started();
    const declared = apply(room, declare(room, 0, true));
    expect(apply(declared, declare(room, 0, true))).toBe(declared);
    expect(() => apply(declared, declare(room, 1, true))).toThrow(/对方已宣言/);
    expect(() => apply(declared, declare(room, 0, false))).toThrow(/先撤销/);
  });

  it("按下时看到的历史条数对不上就拒绝", () => {
    const room = started();
    const next = apply(room, { type: "tenDraw", reason: "noDeclare" });
    expect(() => apply(next, declare(room, 0, true))).toThrow(/局面已变化/);
  });

  it("立直棒用完只能听牌宣言", () => {
    let room = started();
    for (let i = 0; i < TEN_STICKS; i++) {
      room = apply(room, declare(room, 0, true));
      room = apply(room, { type: "tenDraw", reason: "exhausted" });
    }
    expect(present(room).sticks).toEqual([0, 10]);
    expect(() => apply(room, declare(room, 0, true))).toThrow(/立直棒已用完/);
    expect(present(apply(room, declare(room, 0, false))).stage.kind).toBe("B");
  });
});

describe("二人房 / Stage B", () => {
  it("指定两张不同的牌，逐轮累计；Stage A 不能指定", () => {
    const room = started();
    expect(() => apply(room, guess(1, 2))).toThrow(/还没有人宣言/);
    const b = apply(room, declare(room, 0, false));
    expect(() => apply(b, guess(5, 5))).toThrow(/两张不同/);
    expect(() => apply(b, guess(1, 35))).toThrow(/两张不同/);
    const two = apply(b, guess(1, 2), guess(31, 9));
    expect(present(two).stage).toMatchObject({
      guesses: [
        [1, 2],
        [31, 9],
      ],
    });
  });

  it("和牌只发生在 Stage B，和牌者就是进攻方", () => {
    const room = started();
    expect(() => apply(room, { type: "tenTsumo", value: manual(3, 30) })).toThrow(/不能和牌/);
  });

  it("庄家自摸 3 番 30 符得 6000，连庄本场 +1；闲家和牌按闲家自摸算并含本场，换庄本场清零", () => {
    let room = started();
    room = apply(room, declare(room, 0, true), guess(1, 2), {
      type: "tenTsumo",
      value: manual(3, 30),
    });
    expect(present(room)).toMatchObject({
      scores: [6000, 0],
      dealer: 0,
      honba: 1,
      round: 2,
      stage: { kind: "A" },
    });
    expect(present(room).history[0]).toMatchObject({
      kind: "tenTsumo",
      winner: 0,
      riichi: true,
      rounds: 1,
      gain: 6000,
      round: 1,
    });
    room = apply(room, declare(room, 1, false), { type: "tenTsumo", value: manual(3, 30) });
    // 闲家 3 番 30 符自摸 1000 / 2000 → 4000，1 本场 +300；对手不扣分
    expect(present(room)).toMatchObject({ scores: [6000, 4300], dealer: 1, honba: 0, round: 3 });
  });

  it("流局：庄家不变、本场 +1；原因要和阶段对得上", () => {
    const room = started();
    expect(() => apply(room, { type: "tenDraw", reason: "guessed" })).toThrow(/还没有人宣言/);
    const a = apply(room, { type: "tenDraw", reason: "noDeclare" });
    expect(present(a)).toMatchObject({ dealer: 0, honba: 1, round: 2, scores: [0, 0] });
    const b = apply(a, declare(a, 1, true), guess(1, 2));
    expect(() => apply(b, { type: "tenDraw", reason: "noDeclare" })).toThrow(/已有人宣言/);
    const guessed = apply(b, { type: "tenDraw", reason: "guessed" });
    expect(present(guessed)).toMatchObject({ dealer: 0, honba: 2, round: 3, stage: { kind: "A" } });
    expect(present(guessed).history[0]).toMatchObject({
      kind: "tenDraw",
      reason: "guessed",
      attacker: 1,
      riichi: true,
      rounds: 1,
    });
  });

  it("牌面形态：必须是自摸，立直标记要与本局的宣言一致", () => {
    const room = started();
    const tenpai = apply(room, declare(room, 0, false));
    expect(() => apply(tenpai, { type: "tenTsumo", value: handValue({ riichi: true }) })).toThrow(
      /听牌宣言，手牌不能勾立直/,
    );
    expect(() => apply(tenpai, { type: "tenTsumo", value: handValue({ tsumo: false }) })).toThrow(
      /只有自摸和/,
    );
    const riichi = apply(room, declare(room, 0, true));
    expect(() => apply(riichi, { type: "tenTsumo", value: handValue({}) })).toThrow(
      /立直宣言，手牌需要勾立直/,
    );
    const won = apply(riichi, { type: "tenTsumo", value: handValue({ doubleRiichi: true }) });
    expect(present(won).history[0]).toMatchObject({ kind: "tenTsumo", gain: 6000 });
    expect(present(won).history[0]).toHaveProperty("hand.doubleRiichi", true);
  });

  it("不成和的牌面被拒绝", () => {
    const room = started();
    const b = apply(room, declare(room, 0, false));
    const value = handValue({});
    if (value.kind !== "hand") throw new Error("unreachable");
    const noYaku: WinValue = {
      ...value,
      result: { ...value.result, isAgari: false, reason: "noYaku" },
    };
    expect(() => apply(b, { type: "tenTsumo", value: noYaku })).toThrow(DomainError);
  });
});

describe("二人房 / 撤销与终局", () => {
  it("宣言与指定都能一步步撤回，立直棒随快照恢复", () => {
    const room = started();
    const b = apply(room, declare(room, 0, true), guess(1, 2), guess(3, 4));
    const one = apply(b, { type: "undo" });
    expect(present(one).stage).toMatchObject({ guesses: [[1, 2]] });
    const back = apply(one, { type: "undo" }, { type: "undo" });
    expect(present(back).stage).toEqual({ kind: "A" });
    expect(present(back).sticks).toEqual([10, 10]);
    expect(present(apply(back, { type: "redo" })).sticks).toEqual([9, 10]);
  });

  it("Stage B 中途可以终局：未记完的一局不进历史，撤销终局回到 B 接着打", () => {
    let room = started();
    room = apply(room, declare(room, 0, false), { type: "tenTsumo", value: manual(3, 30) });
    room = apply(room, declare(room, 1, true), guess(1, 2));
    const ended = apply(room, { type: "endGame" });
    expect(ended.phase).toBe("finished");
    expect(present(ended).final).toEqual({ scores: [6000, 0], winner: 0 });
    expect(present(ended).history).toHaveLength(1);
    expect(present(ended).stage.kind).toBe("B");
    expect(() => apply(ended, guess(3, 4))).toThrow(/对局已结束/);
    const resumed = apply(ended, { type: "undo" });
    expect(resumed.phase).toBe("playing");
    expect(present(apply(resumed, guess(3, 4))).stage).toMatchObject({
      guesses: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it("同分为平局；重开一局回到初始状态", () => {
    const ended = apply(started(), { type: "endGame" });
    expect(present(ended).final?.winner).toBeNull();
    const again = apply(ended, { type: "newGame" });
    expect(again.gameNo).toBe(2);
    expect(present(again)).toMatchObject({ scores: [0, 0], sticks: [10, 10], round: 1 });
  });
});
