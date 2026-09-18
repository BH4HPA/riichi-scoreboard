import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES, type HandInput } from "@riichi/core";
import { akaAvailable, countTile } from "./quota";

const hand = (closed: number[], melds: HandInput["melds"] = []): HandInput => ({
  closed,
  melds,
  winTile: closed[0] ?? 0,
  tsumo: false,
  doraIndicators: [],
  uraIndicators: [],
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  afterKan: false,
  lastTile: false,
  firstTake: false,
});

describe("countTile", () => {
  it("忽略赤标记计同一基础牌的张数；excluding 那一张不计", () => {
    const h = hand([5, 5, 35, 1], [{ open: true, tiles: [5, 5, 5] }]);
    expect(countTile(h, 5)).toBe(6);
    expect(countTile(h, 35)).toBe(6);
    expect(countTile(h, 5, { area: "closed", i: 2 })).toBe(5);
    expect(countTile(h, 5, { area: "meld", i: 0, j: 1 })).toBe(5);
  });
});

describe("akaAvailable", () => {
  it("普通牌总是可用；赤五受总数与每色上限约束", () => {
    const h = hand([35, 36, 1]);
    expect(akaAvailable(h, 5, MLEAGUE_RULES)).toBe(true);
    expect(akaAvailable(h, 35, MLEAGUE_RULES)).toBe(false);
    expect(akaAvailable(h, 37, MLEAGUE_RULES)).toBe(true);
    const full = hand([35, 36, 37]);
    expect(akaAvailable(full, 35, MLEAGUE_RULES)).toBe(false);
  });

  it("替换自己这张时它不占名额；无赤规则一律不可用", () => {
    const h = hand([35, 36, 37]);
    expect(akaAvailable(h, 35, MLEAGUE_RULES, { area: "closed", i: 0 })).toBe(true);
    const noAka = { ...MLEAGUE_RULES, hand: { ...MLEAGUE_RULES.hand, akaCount: 0 as const } };
    expect(akaAvailable(hand([1]), 35, noAka)).toBe(false);
  });
});
