import { describe, expect, it } from "vitest";
import { seedRiichi } from "./riichiSeed";

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
