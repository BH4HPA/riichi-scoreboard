import { describe, expect, it } from "vitest";
import { TILE } from "@riichi/core";
import { createValueDraft } from "./valueDraft";
import { draftForWinner, draftWithRiichi, effectiveRiichi, storeRiichiClick } from "./riichiSync";

const draft = createValueDraft(false, "hand");
const riichiDraft = { ...draft, hand: { ...draft.hand, riichi: true, ippatsu: true } };

describe("effectiveRiichi", () => {
  it("和牌者那一格取手牌旗标，其余座位取表单勾选", () => {
    const stored = [true, false, true, false];
    expect(effectiveRiichi(stored, [{ winner: 1, draft: riichiDraft }])).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(
      effectiveRiichi(stored, [
        { winner: 0, draft },
        { winner: 3, draft: riichiDraft },
      ]),
    ).toEqual([false, false, true, true]);
  });
});

describe("draftWithRiichi", () => {
  it("未变化原样返回（引用不变）", () => {
    expect(draftWithRiichi(draft, false)).toBe(draft);
    expect(draftWithRiichi(riichiDraft, true)).toBe(riichiDraft);
  });

  it("取消立直连带清掉一发、两立直与里宝", () => {
    const withUra = {
      ...riichiDraft,
      hand: { ...riichiDraft.hand, doubleRiichi: true, uraIndicators: [TILE.M1] },
    };
    const off = draftWithRiichi(withUra, false).hand;
    expect(off).toMatchObject({ riichi: false, doubleRiichi: false, ippatsu: false });
    expect(off.uraIndicators).toEqual([]);
    expect(draftWithRiichi(draft, true).hand.riichi).toBe(true);
  });
});

describe("storeRiichiClick", () => {
  it("只把被点的那一格写进存值", () => {
    // 和牌者 1 的立直来自手牌（存值 false、显示 true）；用户点了座位 3
    const stored = [false, false, false, false];
    const shown = [false, true, false, false];
    expect(storeRiichiClick(stored, shown, [false, true, false, true])).toEqual([
      false,
      false,
      false,
      true,
    ]);
    // 点的正是和牌者那一格
    expect(storeRiichiClick(stored, shown, [false, false, false, false])).toEqual(stored);
  });
});

describe("draftForWinner", () => {
  const stored = [false, false, true, false];
  const withUra = {
    ...riichiDraft,
    riichiAuto: true,
    hand: { ...riichiDraft.hand, uraIndicators: [TILE.M1] },
  };

  it("立直来自牌面侧（识别里宝）：跟着牌走，里宝不丢", () => {
    expect(draftForWinner(withUra, stored, 0, 3)).toBe(withUra);
  });

  it("立直来自立直情况的勾选：留在座位上，手牌取新和牌者那一格", () => {
    // 座位 2 勾过立直且是和牌者 → 换成座位 0（未勾）
    expect(draftForWinner(riichiDraft, stored, 2, 0).hand.riichi).toBe(false);
    // 座位 0 未勾 → 换成座位 2（勾过）
    expect(draftForWinner(draft, stored, 0, 2).hand.riichi).toBe(true);
  });

  it("取消立直时清掉识别替你勾的记号", () => {
    expect(draftWithRiichi(withUra, false).riichiAuto).toBe(false);
    expect(draftWithRiichi({ ...draft, riichiAuto: true }, true).riichiAuto).toBe(true);
  });
});
