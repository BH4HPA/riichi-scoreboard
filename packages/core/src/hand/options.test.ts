import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { HandInput } from "../types/state";
import { TILE } from "../types/tiles";
import { fromEngineOutput, toEngineInput, validateHandInput, YAKU_ID } from "./options";

const R = MLEAGUE_RULES;

function hand(partial: Partial<HandInput> = {}): HandInput {
  return {
    closed: [TILE.M1, TILE.M2, TILE.M3, TILE.P4, TILE.P5, TILE.P6, TILE.S7, TILE.S8, TILE.S9, TILE.M7, TILE.M8, TILE.M9, TILE.P2, TILE.P2],
    melds: [],
    winTile: TILE.M9,
    tsumo: false,
    doraIndicators: [TILE.M1],
    uraIndicators: [],
    aka: 0,
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
    expect(input.closed_part[input.closed_part.length - 1]).toBe(TILE.M1);
    expect(input.options.tile_discarded_by_someone).toBe(-1);
    expect(input.options.dora).toEqual([TILE.M2, TILE.S2]);
    expect(input.options.jikaze).toBe(TILE.East);
    expect(input.options.bakaze).toBe(TILE.South);
  });

  it("副露算 3 张，总数须为 14", () => {
    const h = hand({
      closed: [TILE.M1, TILE.M2, TILE.M3, TILE.P4, TILE.P5, TILE.P6, TILE.S7, TILE.S8, TILE.S9, TILE.P2, TILE.P2],
      melds: [{ open: false, tiles: [TILE.Chun, TILE.Chun, TILE.Chun, TILE.Chun] }],
      winTile: TILE.P2,
    });
    expect(() => validateHandInput(h, R)).not.toThrow();
    expect(() => validateHandInput(hand({ closed: hand().closed.slice(1) }), R)).toThrow(/14 张/);
  });

  it("规则约束：赤牌上限、未立直不计里宝、无一发规则", () => {
    expect(() => validateHandInput(hand({ aka: 4 }), R)).toThrow(/赤宝牌/);
    expect(() => validateHandInput(hand({ uraIndicators: [TILE.S1] }), R)).toThrow(/未立直/);
    const noIppatsu = { ...R, hand: { ...R.hand, ippatsu: false } };
    expect(() => validateHandInput(hand({ riichi: true, ippatsu: true }), noIppatsu)).toThrow(/一发/);
    expect(toEngineInput(hand(), { seat: 0, dealer: 0, roundWind: 0 }, noIppatsu).options.disabled_yaku).toContain(YAKU_ID.Ippatsu);
  });

  it("fromEngineOutput 按规则裁定役满叠加", () => {
    const out = { is_agari: true, yakuman: 2, han: 26, fu: 30, yaku: { "8": 13, "9": 13 } };
    expect(fromEngineOutput(out, R).yakuman).toBe(2);
    const noStack = { ...R, scoring: { ...R.scoring, yakumanStacking: false } };
    expect(fromEngineOutput(out, noStack).yakuman).toBe(1);
  });
});
