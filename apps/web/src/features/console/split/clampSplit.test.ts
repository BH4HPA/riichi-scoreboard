import { describe, expect, it } from "vitest";
import { clampSplit, DEFAULT_SPLIT } from "./clampSplit";

describe("clampSplit", () => {
  it("按两栏最小宽度夹住比例", () => {
    expect(clampSplit(0.2, 1600)).toBeCloseTo(720 / 1600);
    expect(clampSplit(0.9, 1600)).toBeCloseTo(1 - 400 / 1600);
    expect(clampSplit(0.6, 1600)).toBe(0.6);
  });
  it("放不下两栏或宽度未知时用默认值", () => {
    expect(clampSplit(0.3, 1000)).toBe(DEFAULT_SPLIT);
    expect(clampSplit(0.3, 0)).toBe(DEFAULT_SPLIT);
  });
});
