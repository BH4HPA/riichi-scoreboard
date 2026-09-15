import { describe, expect, it } from "vitest";
import { DomainError } from "../progress/advance";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { RoomEvent } from "../types/events";
import type { PlayerRef, RoomState } from "../types/state";
import { createRoom, reduceRoom, replay } from "./reduce";
import { validateCommand } from "./validateCommand";

const players: PlayerRef[] = ["a", "b", "c", "d"].map((id) => ({ id, name: id, avatar: null }));
const ev = (command: RoomEvent["command"], seq = 1): RoomEvent => ({
  seq,
  at: seq,
  actor: { playerId: null, clientId: "t" },
  command,
});
const manual = { kind: "manual" as const, han: 1, fu: 30, yakuman: 0 };

function playingRoom(): RoomState {
  const cmds: RoomEvent["command"][] = [
    ...players.map((player, seat) => ({
      type: "sit" as const,
      seat: seat as 0 | 1 | 2 | 3,
      player,
    })),
    { type: "start", force: true },
  ];
  return replay(
    createRoom("R", MLEAGUE_RULES),
    cmds.map((c, i) => ev(c, i + 1)),
  );
}

describe("validateCommand", () => {
  it("接受合法命令并剥离多余字段", () => {
    expect(validateCommand({ type: "sit", seat: 2, player: { id: "x" } })).toEqual({
      type: "sit",
      seat: 2,
    });
    expect(validateCommand({ type: "tsumo", winner: 0, value: manual, riichi: [1] })).toEqual({
      type: "tsumo",
      winner: 0,
      value: manual,
      riichi: [1],
    });
  });

  it.each([
    [{ type: "whatever" }, /未知命令/],
    [{ type: "sit", seat: 9 }, /座位无效/],
    [{ type: "leave", seat: "1" }, /座位无效/],
    [{ type: "draw", tenpai: "abcd", riichi: [] }, /听牌标记/],
    [{ type: "draw", tenpai: [true, true, true, true], riichi: [0, 0] }, /重复/],
    [
      {
        type: "tsumo",
        winner: 0,
        value: { kind: "manual", han: "3", fu: 30, yakuman: 0 },
        riichi: [],
      },
      /番数/,
    ],
    [{ type: "ron", loser: 0, wins: [], riichi: [] }, /荣和者/],
    [{ type: "adjust", kyoku: -1, honba: 0 }, /局序号/],
    [{ type: "syncProfile", seat: 0, player: players[0] }, /未知命令/],
    ["not an object", /格式错误/],
  ])("拒绝畸形输入 %j", (input, pattern) => {
    expect(() => validateCommand(input)).toThrow(pattern);
    expect(() => validateCommand(input)).toThrow(DomainError);
  });
});

describe("reduceRoom 阶段与不变量", () => {
  it("未知命令类型抛错而不是返回 undefined", () => {
    const room = createRoom("R", MLEAGUE_RULES);
    expect(() => reduceRoom(room, ev({ type: "nope" } as never))).toThrow(DomainError);
  });

  it("座位越界抛错，数组长度不变", () => {
    const room = createRoom("R", MLEAGUE_RULES);
    expect(() => reduceRoom(room, ev({ type: "leave", seat: 9 as never }))).toThrow(/座位无效/);
    expect(room.seats).toHaveLength(4);
  });

  it("开局后禁止改规则/换座；终局后需先返回大厅", () => {
    const room = playingRoom();
    expect(() => reduceRoom(room, ev({ type: "setRules", rules: MLEAGUE_RULES }, 9))).toThrow(
      /开局后/,
    );
    expect(() => reduceRoom(room, ev({ type: "leave", seat: 0 }, 9))).toThrow(/开局后/);
    const finished = reduceRoom(room, ev({ type: "endGame" }, 9));
    expect(finished.phase).toBe("finished");
    expect(() =>
      reduceRoom(finished, ev({ type: "sit", seat: 0, player: players[1]! }, 10)),
    ).toThrow(/返回大厅/);
    expect(() => reduceRoom(finished, ev({ type: "setRules", rules: MLEAGUE_RULES }, 10))).toThrow(
      /返回大厅/,
    );
  });

  it("newGame 仅终局后可用；start 仅大厅可用", () => {
    const room = playingRoom();
    expect(() => reduceRoom(room, ev({ type: "newGame" }, 9))).toThrow(/尚未结束/);
    expect(() => reduceRoom(room, ev({ type: "start", force: true }, 9))).toThrow(/开局后/);
    const finished = reduceRoom(room, ev({ type: "endGame" }, 9));
    const fresh = reduceRoom(finished, ev({ type: "newGame" }, 10));
    expect(fresh.phase).toBe("playing");
    expect(fresh.game!.present.players.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("包牌仅适用于役满", () => {
    const room = playingRoom();
    expect(() =>
      reduceRoom(room, ev({ type: "tsumo", winner: 0, value: manual, riichi: [], pao: 1 }, 9)),
    ).toThrow(/役满/);
    const ok = reduceRoom(
      room,
      ev(
        {
          type: "tsumo",
          winner: 0,
          value: { kind: "manual", han: 0, fu: 0, yakuman: 1 },
          riichi: [],
          pao: 1,
        },
        9,
      ),
    );
    expect(ok.game!.present.points).toEqual([73000, -23000, 25000, 25000]);
  });

  it("牌面形态的和牌把手牌与役种写入历史记录", () => {
    const room = playingRoom();
    const hand = {
      closed: [1, 2, 3, 13, 36, 15, 25, 26, 27, 7, 8, 9, 11, 11],
      melds: [],
      winTile: 9,
      tsumo: false,
      doraIndicators: [],
      uraIndicators: [],
      riichi: false,
      doubleRiichi: false,
      ippatsu: false,
      afterKan: false,
      lastTile: false,
      firstTake: false,
    };
    const result = { han: 2, fu: 30, yakuman: 0, yaku: { "33": 1, "55": 1 }, isAgari: true };
    const next = reduceRoom(
      room,
      ev(
        {
          type: "ron",
          loser: 3,
          wins: [{ winner: 1, value: { kind: "hand", hand, result } }],
          riichi: [],
        },
        9,
      ),
    );
    const entry = next.game!.present.history[0]!;
    expect(entry.kind).toBe("ron");
    if (entry.kind !== "ron") return;
    expect(entry.wins[0]!.hand).toEqual(hand);
    expect(entry.wins[0]!.yaku).toEqual(result.yaku);
    expect(next.game!.present.points).toEqual([25000, 27000, 25000, 23000]);
  });

  it("syncProfile 只更新对应座位且要求 id 一致", () => {
    const room = playingRoom();
    const next = reduceRoom(
      room,
      ev({ type: "syncProfile", seat: 1, player: { id: "b", name: "新名", avatar: "/x" } }, 9),
    );
    expect(next.seats[1]).toEqual({ id: "b", name: "新名", avatar: "/x" });
    expect(() =>
      reduceRoom(
        room,
        ev({ type: "syncProfile", seat: 1, player: { id: "z", name: "冒充", avatar: null } }, 9),
      ),
    ).toThrow(/不符/);
  });
});
