import { describe, expect, it } from "vitest";
import { firstTakeLabel } from "./firstTake";

describe("firstTakeLabel", () => {
  it("自摸按庄闲区分，荣和恒为人和，未知庄闲两个都写", () => {
    expect(firstTakeLabel(true, true)).toBe("天和");
    expect(firstTakeLabel(true, false)).toBe("地和");
    expect(firstTakeLabel(true, null)).toBe("天和 / 地和");
    expect(firstTakeLabel(false, true)).toBe("人和");
    expect(firstTakeLabel(false, null)).toBe("人和");
  });
});
