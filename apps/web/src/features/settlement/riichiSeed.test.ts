import { describe, expect, it } from "vitest";
import { withRiichi } from "./hand/handEdits";
import { seedRiichi, winnerDraftAfterSeed } from "./riichiSeed";
import { createValueDraft } from "./valueDraft";

const F = [false, false, false, false];

describe("seedRiichi", () => {
  it("新声明勾上并记为已并入", () => {
    expect(seedRiichi({ riichi: F, seeded: F }, [false, true, false, false])).toEqual({
      riichi: [false, true, false, false],
      seeded: [false, true, false, false],
    });
  });
  it("已并入后用户取消的不再勾回；无新声明原样返回", () => {
    const current = { riichi: F, seeded: [false, true, false, false] };
    expect(seedRiichi(current, [false, true, false, false])).toBe(current);
  });
  it("不动用户手勾的其它座位", () => {
    expect(
      seedRiichi({ riichi: [true, false, false, false], seeded: F }, [false, false, true, false]),
    ).toEqual({ riichi: [true, false, true, false], seeded: [false, false, true, false] });
  });
});

describe("winnerDraftAfterSeed", () => {
  const handRiichi = {
    ...createValueDraft(true, "hand"),
    hand: withRiichi(createValueDraft(true, "hand").hand, true),
  };
  it("别家新声明不动和牌者牌面侧来的立直", () => {
    // 和牌者 0：存值 false，手牌上的立直来自识别/手点；南家新声明
    expect(winnerDraftAfterSeed(handRiichi, 0, F, [false, true, false, false])).toBe(handRiichi);
  });
  it("和牌者自己那格被并入时，手牌跟着勾上", () => {
    const plain = createValueDraft(true, "hand");
    expect(winnerDraftAfterSeed(plain, 0, F, [true, false, false, false]).hand.riichi).toBe(true);
  });
});
