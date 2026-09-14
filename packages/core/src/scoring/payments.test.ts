import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import { chomboPayment, drawPayment, nagashiPayment, sticksCollector } from "./payments";

const R = MLEAGUE_RULES;

describe("drawPayment", () => {
  it("1 家听牌：其余各付 1000", () => {
    expect(drawPayment([true, false, false, false], [], R).deltas).toEqual([
      3000, -1000, -1000, -1000,
    ]);
  });
  it("2 家听牌：未听各付 1500", () => {
    expect(drawPayment([true, true, false, false], [], R).deltas).toEqual([
      1500, 1500, -1500, -1500,
    ]);
  });
  it("3 家听牌：未听付 3000", () => {
    expect(drawPayment([true, true, true, false], [], R).deltas).toEqual([1000, 1000, 1000, -3000]);
  });
  it("0 或 4 家听牌：不移动；立直者扣 1000", () => {
    expect(drawPayment([false, false, false, false], [1], R).deltas).toEqual([0, -1000, 0, 0]);
    expect(drawPayment([true, true, true, true], [], R).deltas).toEqual([0, 0, 0, 0]);
  });
  it("无罚符规则", () => {
    const noBappu = { ...R, scoring: { ...R.scoring, notenBappu: 0 } };
    expect(drawPayment([true, false, false, false], [], noBappu).deltas).toEqual([0, 0, 0, 0]);
  });
});

describe("sticksCollector", () => {
  it("双响时离放铳者最近者收供托", () => {
    expect(sticksCollector([1, 3], 2)).toBe(3);
    expect(sticksCollector([1, 3], 0)).toBe(1);
  });
});

describe("chombo / nagashi", () => {
  it("闲家错和：向庄 4000、向闲 2000", () => {
    expect(chomboPayment(1, 0)).toEqual([4000, -8000, 2000, 2000]);
  });
  it("庄家错和：4000 all", () => {
    expect(chomboPayment(0, 0)).toEqual([-12000, 4000, 4000, 4000]);
  });
  it("流局满贯按满贯自摸支付", () => {
    expect(nagashiPayment([1], 0, 0, R)).toEqual([-4000, 8000, -2000, -2000]);
  });
});
