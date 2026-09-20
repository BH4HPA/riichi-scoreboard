import { describe, expect, it } from "vitest";
import { roomHandContext } from "../hand/roomContext";
import { autoStartEligible, toRoomView } from "../protocol/view";
import { validateUiIntent } from "../protocol/uiIntent";
import { TOLERATES_STALE } from "../protocol/policy";
import { createRoom, reduceRoom } from "../reducer/reduce";
import { validateCommand } from "../reducer/validateCommand";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { Command } from "../types/commands";
import { seatNames, type PlayerRef, type TenRoomState } from "../types/state";
import { describeTenEntry, describeTenRevert } from "./describe";

const MIN = 60_000;
const START = 5_000;
const players: PlayerRef[] = [
  { id: "a", name: "阿东", avatar: null, kind: "device" },
  { id: "b", name: "阿西", avatar: null, kind: "device" },
];

let seq = 0;
function apply(room: TenRoomState, ...commands: Command[]): TenRoomState {
  return commands.reduce(
    (r, command) =>
      reduceRoom(r, {
        seq: ++seq,
        at: START,
        actor: { playerId: null, clientId: "t" },
        command,
      }),
    room,
  );
}

function playing(): TenRoomState {
  return apply(
    createRoom("TEN123", MLEAGUE_RULES, "ten"),
    { type: "sit", seat: 0, player: players[0]! },
    { type: "sit", seat: 1, player: players[1]!, ready: true },
    { type: "setReady", seat: 0, ready: true },
    { type: "start", force: false },
  );
}

describe("二人房 / 房间壳", () => {
  it("空座占位名是东、西；两人坐满并准备即满足自动开局", () => {
    const lobby = createRoom("TEN123", MLEAGUE_RULES, "ten");
    expect(seatNames(lobby)).toEqual(["东风家", "西风家"]);
    const full = apply(
      lobby,
      { type: "sit", seat: 0, player: players[0]!, ready: true },
      { type: "sit", seat: 1, player: players[1]!, ready: true },
    );
    expect(autoStartEligible(full, [true, true])).toBe(true);
  });

  it("和牌场况：场风东，庄家自风东、闲家自风西（而不是 1 号位的南）", () => {
    const room = playing();
    expect(roomHandContext(room, 0)).toEqual({ seat: 0, dealer: 0, roundWind: 0 });
    expect(roomHandContext(room, 1)).toEqual({ seat: 2, dealer: 0, roundWind: 0 });
    // 闲家和牌后换庄：1 号位成为庄家
    const swapped = apply(
      room,
      { type: "tenDeclare", seat: 1, riichi: false, entries: 0 },
      { type: "tenTsumo", value: { kind: "manual", han: 1, fu: 30, yakuman: 0 } },
    );
    expect(roomHandContext(swapped, 1)).toEqual({ seat: 0, dealer: 0, roundWind: 0 });
    expect(roomHandContext(swapped, 0)).toEqual({ seat: 2, dealer: 0, roundWind: 0 });
  });
});

describe("二人房 / 视图", () => {
  it("暗计时只给档位：对局中按开局时刻现算，大厅与终局后为 0", () => {
    const view = (room: TenRoomState, now: number) =>
      toRoomView(room, 1, new Set(), null, null, now);
    const room = playing();
    expect(view(room, START + 49 * MIN)).toMatchObject({ kind: "ten", timeMark: 0 });
    expect(view(room, START + 50 * MIN)).toMatchObject({ timeMark: 1 });
    expect(view(room, START + 61 * MIN)).toMatchObject({ timeMark: 3 });
    expect(view(apply(room, { type: "endGame" }), START + 61 * MIN)).toMatchObject({ timeMark: 0 });
    expect(view(createRoom("L", MLEAGUE_RULES, "ten"), START + 61 * MIN)).toMatchObject({
      timeMark: 0,
      game: null,
    });
  });

  it("四人房视图不带计时档", () => {
    const view = toRoomView(createRoom("Y", MLEAGUE_RULES), 0, new Set(), null, null, 0);
    expect(view.kind).toBe("yonma");
    expect(view).not.toHaveProperty("timeMark");
  });
});

describe("二人房 / 命令形状与策略", () => {
  it("validateCommand 规范化四条二人房命令", () => {
    expect(validateCommand({ type: "tenDeclare", seat: 1, riichi: true, entries: 3 })).toEqual({
      type: "tenDeclare",
      seat: 1,
      riichi: true,
      entries: 3,
    });
    expect(validateCommand({ type: "tenMark", tile: 34, on: true, entries: 0, extra: 1 })).toEqual({
      type: "tenMark",
      tile: 34,
      on: true,
      entries: 0,
    });
    expect(validateCommand({ type: "tenDraw", reason: "guessed" })).toEqual({
      type: "tenDraw",
      reason: "guessed",
    });
    expect(() => validateCommand({ type: "tenMark", tile: 35, on: true, entries: 0 })).toThrow(
      /划掉的牌/,
    );
    expect(() => validateCommand({ type: "tenMark", tile: 1, on: "yes", entries: 0 })).toThrow(
      /划掉标记/,
    );
    expect(() => validateCommand({ type: "tenDraw", reason: "ryuukyoku" })).toThrow(/流局原因/);
    expect(() => validateCommand({ type: "tenTsumo", value: null })).toThrow(/和牌价值/);
  });

  it("宣言与划牌不看 baseSeq（自带历史条数且幂等），记结果要最新局面", () => {
    expect([TOLERATES_STALE.tenDeclare, TOLERATES_STALE.tenMark]).toEqual([true, true]);
    expect([TOLERATES_STALE.tenDraw, TOLERATES_STALE.tenTsumo]).toEqual([false, false]);
  });
});

describe("二人房 / 镜像意图", () => {
  it("结算与规则说明", () => {
    expect(
      validateUiIntent({
        kind: "tenSettlement",
        mode: "tsumo",
        summary: "x",
        gain: 6000,
        win: null,
      }),
    ).toEqual({ kind: "tenSettlement", mode: "tsumo", summary: "x", gain: 6000, win: null });
    expect(() =>
      validateUiIntent({
        kind: "tenSettlement",
        mode: "ron",
        summary: null,
        gain: null,
        win: null,
      }),
    ).toThrow(/镜像意图/);
    expect(validateUiIntent({ kind: "tenGuide", page: "stageB" })).toEqual({
      kind: "tenGuide",
      page: "stageB",
    });
    expect(() => validateUiIntent({ kind: "tenGuide", page: "nope" })).toThrow(/镜像意图/);
  });
});

describe("二人房 / 描述", () => {
  it("历史条目与撤销提示", () => {
    const room = playing();
    const declared = apply(room, { type: "tenDeclare", seat: 0, riichi: true, entries: 0 });
    const won = apply(declared, {
      type: "tenTsumo",
      value: { kind: "manual", han: 3, fu: 30, yakuman: 0 },
    });
    const g = (r: TenRoomState) => r.game!.present;
    expect(describeTenEntry(g(won).history[0]!)).toBe(
      "第 1 局 0 本场：庄家 阿东 立直后自摸 3 番 30 符，得 6,000 点。",
    );
    const drawn = apply(won, { type: "tenDraw", reason: "noDeclare" });
    expect(describeTenEntry(g(drawn).history[0]!)).toBe("第 2 局 1 本场：18 巡内无人宣言，流局。");
    const verbal = apply(drawn, { type: "tenDeclare", seat: 1, riichi: false, entries: 2 });
    const hit = apply(verbal, { type: "tenDraw", reason: "guessed" });
    expect(describeTenEntry(g(hit).history[0]!)).toBe(
      "第 3 局 2 本场：闲家 阿西 听牌宣言，被猜中待牌，流局。",
    );

    // 撤销提示用当前的座位昵称：对局中改过名，开局快照里的是旧名字
    const names = ["东哥", "阿西"];
    expect(describeTenRevert(g(declared), g(room), names)).toBe("东哥的立直");
    expect(describeTenRevert(g(won), g(declared), names)).toBe("第 1 局 0 本场 阿东自摸和");
    const ended = apply(won, { type: "endGame" });
    expect(describeTenRevert(g(ended), g(won), names)).toBe("终局");
  });
});
