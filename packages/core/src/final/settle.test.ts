import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import { computeRanks, settleFinal } from "./settle";

const R = MLEAGUE_RULES;

describe("settleFinal (M-League)", () => {
  it("无同点：uma 30-10 + oka 20 归一位", () => {
    const r = settleFinal([42000, 31000, 17000, 10000], 0, R);
    expect(r.ranks).toEqual([1, 2, 3, 4]);
    expect(r.scores).toEqual([62, 11, -23, -50]);
    expect(r.scores.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("同点按分：两位并列一位", () => {
    const r = settleFinal([35000, 35000, 20000, 10000], 0, R);
    expect(r.ranks).toEqual([1, 1, 3, 4]);
    // 一位与二位的顺位点 (30+20) + 10 = 60 → 各 30
    expect(r.uma[0]).toBe(30);
    expect(r.uma[1]).toBe(30);
    expect(r.scores).toEqual([35, 35, -20, -50]);
  });

  it("同点起家优先", () => {
    const seatRule = { ...R, final: { ...R.final, tieRule: "seat" as const } };
    const r = settleFinal([35000, 35000, 20000, 10000], 0, seatRule);
    expect(r.ranks).toEqual([1, 2, 3, 4]);
    expect(r.scores).toEqual([55, 15, -20, -50]);
  });

  it("残留场供归一位", () => {
    const r = settleFinal([40000, 30000, 20000, 8000], 2, R);
    expect(r.kyotakuDeltas).toEqual([2000, 0, 0, 0]);
    expect(r.points[0]).toBe(42000);
  });

  it("残留场供消失 / 平分", () => {
    const voidRule = { ...R, final: { ...R.final, leftoverKyotaku: "void" as const } };
    expect(settleFinal([40000, 30000, 20000, 9000], 1, voidRule).kyotakuDeltas).toEqual([
      0, 0, 0, 0,
    ]);
    const splitRule = { ...R, final: { ...R.final, leftoverKyotaku: "split" as const } };
    expect(settleFinal([40000, 30000, 20000, 9000], 2, splitRule).kyotakuDeltas).toEqual([
      500, 500, 500, 500,
    ]);
  });

  it("击飞奖励", () => {
    const tobiRule = {
      ...R,
      progress: { ...R.progress, tobi: { enabled: true, threshold: "below0" as const, bonus: 10 } },
    };
    const r = settleFinal([60000, 30000, 12000, -2000], 0, tobiRule, { seats: [3], by: 0 });
    expect(r.scores[0]).toBe(30 + 30 + 20 + 10);
    expect(r.scores[3]).toBe(-32 - 30 - 10);
    // 一次飞两家：奖励逐人算
    const two = settleFinal([70000, 31000, -500, -500], 0, tobiRule, { seats: [2, 3], by: 0 });
    expect(two.scores[0]).toBe(40 + 30 + 20 + 20);
    // 两家同点按分：三位 -10 与四位 -30 均分成各 -20
    expect(two.scores[2]).toBe(-30.5 - 20 - 10);
    expect(two.scores[3]).toBe(-30.5 - 20 - 10);
  });

  it("按分规则下并列一位平分残留场供，余数给离起家近者，并列名次不拆", () => {
    const r = settleFinal([35000, 35000, 20000, 10000], 1, R);
    expect(r.kyotakuDeltas).toEqual([500, 500, 0, 0]);
    expect(r.ranks).toEqual([1, 1, 3, 4]);
    expect(r.uma[0]).toBe(r.uma[1]);
    const three = settleFinal([30000, 30000, 30000, 10000], 1, R);
    expect(three.kyotakuDeltas).toEqual([400, 300, 300, 0]);
    expect(three.ranks).toEqual([1, 1, 1, 4]);
    // 座位优先规则：全归一位
    const seatRule = { ...R, final: { ...R.final, tieRule: "seat" as const } };
    expect(settleFinal([35000, 35000, 20000, 10000], 1, seatRule).kyotakuDeltas).toEqual([
      1000, 0, 0, 0,
    ]);
  });

  it("三人同点按分：十分位余数给离起家近者，总分归零", () => {
    const r = settleFinal([30000, 30000, 30000, 10000], 0, R);
    // 一位 +50、二位 +10、三位 -10 合计 50 → 16.7 / 16.7 / 16.6
    expect(r.uma).toEqual([16.7, 16.7, 16.6, -30]);
    expect(r.scores.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
  });

  it("computeRanks", () => {
    expect(computeRanks([25000, 25000, 25000, 25000], "split")).toEqual([1, 1, 1, 1]);
    expect(computeRanks([25000, 25000, 25000, 25000], "seat")).toEqual([1, 2, 3, 4]);
  });
});
