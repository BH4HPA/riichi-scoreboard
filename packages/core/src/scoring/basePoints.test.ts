import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import { calcBasePoints, effectiveYakuman, scoreTier } from "./basePoints";
import { ronPayment, tsumoPayment } from "./payments";

const R = MLEAGUE_RULES;
const noKiriage = { ...R, scoring: { ...R.scoring, kiriageMangan: false } };
const kazoe = { ...R, scoring: { ...R.scoring, kazoeYakuman: true } };
const noStack = { ...R, scoring: { ...R.scoring, yakumanStacking: false } };

/** 闲家荣和点数表（不含本场）：[番, 符] → 点。手算自标准点数表。 */
const NON_DEALER_RON: Array<[number, number, number]> = [
  [1, 30, 1000],
  [1, 40, 1300],
  [1, 50, 1600],
  [1, 60, 2000],
  [1, 70, 2300],
  [1, 80, 2600],
  [1, 90, 2900],
  [1, 100, 3200],
  [1, 110, 3600],
  [2, 20, 1300],
  [2, 25, 1600],
  [2, 30, 2000],
  [2, 40, 2600],
  [2, 50, 3200],
  [2, 60, 3900],
  [2, 70, 4500],
  [2, 80, 5200],
  [2, 90, 5800],
  [2, 100, 6400],
  [2, 110, 7100],
  [3, 20, 2600],
  [3, 25, 3200],
  [3, 30, 3900],
  [3, 40, 5200],
  [3, 50, 6400],
  [3, 60, 8000],
  [3, 70, 8000],
  [4, 20, 5200],
  [4, 25, 6400],
  [4, 30, 8000],
  [4, 40, 8000],
  [5, 30, 8000],
  [6, 30, 12000],
  [7, 30, 12000],
  [8, 30, 16000],
  [10, 30, 16000],
  [11, 30, 24000],
  [13, 30, 24000],
];

describe("calcBasePoints (M-League)", () => {
  it.each(NON_DEALER_RON)("%i 番 %i 符 → 闲家荣和 %i", (han, fu, expected) => {
    const p = ronPayment(
      {
        winner: 1,
        loser: 2,
        dealer: 0,
        base: calcBasePoints({ han, fu, yakuman: 0 }, R),
        honba: 0,
        kyotaku: 0,
        riichi: [],
        collectsSticks: true,
      },
      R,
    );
    expect(p.deltas[1]).toBe(expected);
    expect(p.deltas[2]).toBe(-expected);
  });

  it("庄家荣和 = 闲家 ×1.5（取整到百）", () => {
    const base = calcBasePoints({ han: 3, fu: 40, yakuman: 0 }, R);
    const p = ronPayment(
      {
        winner: 0,
        loser: 1,
        dealer: 0,
        base,
        honba: 0,
        kyotaku: 0,
        riichi: [],
        collectsSticks: true,
      },
      R,
    );
    expect(p.deltas[0]).toBe(7700);
  });

  it("切上满贯开关", () => {
    expect(calcBasePoints({ han: 4, fu: 30, yakuman: 0 }, R)).toBe(2000);
    expect(calcBasePoints({ han: 3, fu: 60, yakuman: 0 }, R)).toBe(2000);
    expect(calcBasePoints({ han: 4, fu: 30, yakuman: 0 }, noKiriage)).toBe(1920);
    expect(calcBasePoints({ han: 3, fu: 60, yakuman: 0 }, noKiriage)).toBe(1920);
    expect(scoreTier({ han: 4, fu: 30, yakuman: 0 }, noKiriage)).toBe("normal");
  });

  it("累计役满开关：M-League 13 番封顶三倍满", () => {
    expect(calcBasePoints({ han: 13, fu: 30, yakuman: 0 }, R)).toBe(6000);
    expect(scoreTier({ han: 13, fu: 30, yakuman: 0 }, R)).toBe("sanbaiman");
    expect(calcBasePoints({ han: 13, fu: 30, yakuman: 0 }, kazoe)).toBe(8000);
    expect(scoreTier({ han: 13, fu: 30, yakuman: 0 }, kazoe)).toBe("kazoeYakuman");
  });

  it("复合役满叠加开关", () => {
    expect(calcBasePoints({ han: 0, fu: 0, yakuman: 2 }, R)).toBe(16000);
    expect(calcBasePoints({ han: 0, fu: 0, yakuman: 2 }, noStack)).toBe(8000);
    expect(effectiveYakuman({ han: 0, fu: 0, yakuman: 2 }, R)).toBe(2);
    expect(effectiveYakuman({ han: 0, fu: 0, yakuman: 2 }, noStack)).toBe(1);
  });
});

describe("tsumoPayment", () => {
  it("闲家自摸 3 番 30 符：庄 2000 / 闲 1000", () => {
    const base = calcBasePoints({ han: 3, fu: 30, yakuman: 0 }, R);
    const p = tsumoPayment({ winner: 1, dealer: 0, base, honba: 0, kyotaku: 0, riichi: [] }, R);
    expect(p.deltas).toEqual([-2000, 4000, -1000, -1000]);
  });

  it("庄家自摸 1 番 30 符：500 all", () => {
    const base = calcBasePoints({ han: 1, fu: 30, yakuman: 0 }, R);
    const p = tsumoPayment({ winner: 0, dealer: 0, base, honba: 0, kyotaku: 0, riichi: [] }, R);
    expect(p.deltas).toEqual([1500, -500, -500, -500]);
  });

  it("本场、场供与本局立直", () => {
    const base = calcBasePoints({ han: 2, fu: 30, yakuman: 0 }, R);
    const p = tsumoPayment({ winner: 2, dealer: 0, base, honba: 2, kyotaku: 1, riichi: [2, 3] }, R);
    // 闲家 2 番 30 符：庄 1000 / 闲 500，本场每家 200
    expect(p.deltas).toEqual([
      -1200,
      -700,
      1000 + 500 + 500 + 600 + 1000 + 2000 - 1000,
      -700 - 1000,
    ]);
    expect(p.honbaIncome).toBe(600);
    expect(p.kyotakuIncome).toBe(1000);
    expect(p.riichiIncome).toBe(2000);
  });

  it("包牌自摸：责任者全付", () => {
    const p = tsumoPayment(
      { winner: 1, dealer: 0, base: 8000, honba: 1, kyotaku: 0, riichi: [], pao: 3 },
      R,
    );
    expect(p.deltas).toEqual([0, 32300, 0, -32300]);
  });

  it("包牌荣和：责任者与放铳者各半，本场归放铳者", () => {
    const p = ronPayment(
      {
        winner: 1,
        loser: 2,
        dealer: 0,
        base: 8000,
        honba: 1,
        kyotaku: 0,
        riichi: [],
        collectsSticks: true,
        pao: 3,
      },
      R,
    );
    expect(p.deltas).toEqual([0, 32300, -16300, -16000]);
  });
});
