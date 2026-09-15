import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { HandInput } from "../types/state";
import { AKA, TILE } from "../types/tiles";
import {
  akaCount,
  akaLimit,
  fromEngineOutput,
  toEngineInput,
  validateHandInput,
  YAKU_ID,
} from "./options";

const R = MLEAGUE_RULES;

function hand(partial: Partial<HandInput> = {}): HandInput {
  return {
    closed: [
      TILE.M1,
      TILE.M2,
      TILE.M3,
      TILE.P4,
      TILE.P5,
      TILE.P6,
      TILE.S7,
      TILE.S8,
      TILE.S9,
      TILE.M7,
      TILE.M8,
      TILE.M9,
      TILE.P2,
      TILE.P2,
    ],
    melds: [],
    winTile: TILE.M9,
    tsumo: false,
    doraIndicators: [TILE.M1],
    uraIndicators: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    afterKan: false,
    lastTile: false,
    firstTake: false,
    ...partial,
  };
}

describe("toEngineInput", () => {
  it("荣和：和张作为 tile_discarded_by_someone，宝牌由指示牌推导", () => {
    const input = toEngineInput(hand(), { seat: 1, dealer: 0, roundWind: 0 }, R);
    expect(input.options.tile_discarded_by_someone).toBe(TILE.M9);
    expect(input.closed_part).toHaveLength(13);
    expect(input.closed_part.filter((t) => t === TILE.M9)).toHaveLength(0);
    expect(input.options.dora).toEqual([TILE.M2]);
    expect(input.options.bakaze).toBe(TILE.East);
    expect(input.options.jikaze).toBe(TILE.South);
    expect(input.options.with_kiriage).toBe(true);
    expect(input.options.disabled_yaku).toEqual([YAKU_ID.Renhou]);
  });

  it("自摸：和张移到最后，里宝仅立直时计入", () => {
    const input = toEngineInput(
      hand({ tsumo: true, winTile: TILE.M1, riichi: true, uraIndicators: [TILE.S1] }),
      { seat: 0, dealer: 0, roundWind: 1 },
      R,
    );
    expect(input.closed_part).toHaveLength(14);
    expect(input.closed_part[input.closed_part.length - 1]).toBe(TILE.M1);
    expect(input.options.tile_discarded_by_someone).toBe(-1);
    expect(input.options.dora).toEqual([TILE.M2, TILE.S2]);
    expect(input.options.jikaze).toBe(TILE.East);
    expect(input.options.bakaze).toBe(TILE.South);
  });

  it("副露算 3 张，总数须为 14", () => {
    const h = hand({
      closed: [
        TILE.M1,
        TILE.M2,
        TILE.M3,
        TILE.P4,
        TILE.P5,
        TILE.P6,
        TILE.S7,
        TILE.S8,
        TILE.S9,
        TILE.P2,
        TILE.P2,
      ],
      melds: [{ open: false, tiles: [TILE.Chun, TILE.Chun, TILE.Chun, TILE.Chun] }],
      winTile: TILE.P2,
    });
    expect(() => validateHandInput(h, R)).not.toThrow();
    expect(() => validateHandInput(hand({ closed: hand().closed.slice(1) }), R)).toThrow(/14 张/);
  });

  it("赤五：折回普通五送引擎，张数计入 aka_count，和张为赤五时同样折回", () => {
    const closed = [...hand().closed];
    closed[closed.indexOf(TILE.P5)] = AKA.P5;
    const h = hand({ closed, winTile: AKA.P5 });
    const input = toEngineInput(h, { seat: 1, dealer: 0, roundWind: 0 }, R);
    expect(input.options.aka_count).toBe(1);
    expect(input.options.tile_discarded_by_someone).toBe(TILE.P5);
    expect(input.closed_part.every((t) => t <= 34)).toBe(true);
    expect(input.closed_part.filter((t) => t === TILE.P5)).toHaveLength(0);
    expect(akaCount(h)).toBe(1);
    // 副露中的赤五同样计数并折回
    const open = hand({
      closed: [
        TILE.M1,
        TILE.M2,
        TILE.M3,
        TILE.S7,
        TILE.S8,
        TILE.S9,
        TILE.M7,
        TILE.M8,
        TILE.M9,
        TILE.P2,
        TILE.P2,
      ],
      melds: [{ open: true, tiles: [AKA.M5, TILE.M5, TILE.M5] }],
      winTile: TILE.P2,
    });
    const openInput = toEngineInput(open, { seat: 1, dealer: 0, roundWind: 0 }, R);
    expect(openInput.options.aka_count).toBe(1);
    expect(openInput.open_part[0]![1]).toEqual([TILE.M5, TILE.M5, TILE.M5]);
  });

  it("赤五上限：总数不超过规则、同色不超过 akaLimit、与普通五合计不超过 4 张", () => {
    const three = hand({
      closed: [
        AKA.M5,
        TILE.M5,
        TILE.M5,
        TILE.P4,
        AKA.P5,
        TILE.P6,
        TILE.S7,
        TILE.S8,
        TILE.S9,
        TILE.M7,
        TILE.M8,
        TILE.M9,
        TILE.P2,
        TILE.P2,
      ],
      winTile: TILE.M9,
    });
    expect(() => validateHandInput(three, R)).not.toThrow();
    const twoM = hand({
      closed: [
        AKA.M5,
        AKA.M5,
        TILE.M5,
        TILE.P4,
        TILE.P5,
        TILE.P6,
        TILE.S7,
        TILE.S8,
        TILE.S9,
        TILE.M7,
        TILE.M8,
        TILE.M9,
        TILE.P2,
        TILE.P2,
      ],
      winTile: TILE.M9,
    });
    expect(() => validateHandInput(twoM, R)).toThrow(/同一花色/);
    const noAka = { ...R, hand: { ...R.hand, akaCount: 0 as const } };
    expect(() => validateHandInput(three, noAka)).toThrow(/赤宝牌最多 0/);
    const fourAka = { ...R, hand: { ...R.hand, akaCount: 4 as const } };
    const twoP = hand({
      closed: [
        TILE.M5,
        TILE.M5,
        TILE.M5,
        AKA.P5,
        AKA.P5,
        TILE.P5,
        TILE.S7,
        TILE.S8,
        TILE.S9,
        TILE.M7,
        TILE.M8,
        TILE.M9,
        TILE.P2,
        TILE.P2,
      ],
      winTile: TILE.M9,
    });
    expect(() => validateHandInput(twoP, fourAka)).not.toThrow();
    expect(() => validateHandInput(twoP, R)).toThrow(/同一花色/);
    const fiveFives = hand({
      closed: [
        AKA.P5,
        TILE.P5,
        TILE.P5,
        TILE.P5,
        TILE.P5,
        TILE.P6,
        TILE.S7,
        TILE.S8,
        TILE.S9,
        TILE.M7,
        TILE.M8,
        TILE.M9,
        TILE.P2,
        TILE.P2,
      ],
      winTile: TILE.M9,
    });
    expect(() => validateHandInput(fiveFives, R)).toThrow(/超过 4 张/);
    expect(akaLimit("p", 4)).toBe(2);
    expect(akaLimit("m", 4)).toBe(1);
    expect(akaLimit("s", 3)).toBe(1);
  });

  it("规则约束：未立直不计里宝、无一发规则", () => {
    expect(() => validateHandInput(hand({ uraIndicators: [TILE.S1] }), R)).toThrow(/未立直/);
    const noIppatsu = { ...R, hand: { ...R.hand, ippatsu: false } };
    expect(() => validateHandInput(hand({ riichi: true, ippatsu: true }), noIppatsu)).toThrow(
      /一发/,
    );
    expect(
      toEngineInput(hand(), { seat: 0, dealer: 0, roundWind: 0 }, noIppatsu).options.disabled_yaku,
    ).toContain(YAKU_ID.Ippatsu);
  });

  it("fromEngineOutput 按规则裁定役满叠加", () => {
    const out = { is_agari: true, yakuman: 2, han: 26, fu: 30, yaku: { "8": 13, "9": 13 } };
    expect(fromEngineOutput(out, R).yakuman).toBe(2);
    const noStack = { ...R, scoring: { ...R.scoring, yakumanStacking: false } };
    expect(fromEngineOutput(out, noStack).yakuman).toBe(1);
  });
});
