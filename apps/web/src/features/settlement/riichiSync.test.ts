import { describe, expect, it } from "vitest";
import { TILE } from "@riichi/core";
import { createValueDraft } from "./valueDraft";
import { draftWithRiichi, effectiveRiichi } from "./riichiSync";

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
