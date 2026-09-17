import { describe, expect, it } from "vitest";
import { myDiffs } from "./diffRows";

describe("myDiffs", () => {
  it("按点差从小到大：落后最多的在最前，领先最多的在最后", () => {
    expect(myDiffs([30000, 22000, 25000, 23000], 3)).toEqual([
      { seat: 0, diff: -7000 },
      { seat: 2, diff: -2000 },
      { seat: 1, diff: 1000 },
    ]);
  });
});

describe("myDiffs 同分", () => {
  it("点差相同按座位", () => {
    expect(myDiffs([25000, 25000, 25000, 25000], 2).map((d) => d.seat)).toEqual([0, 1, 3]);
  });
});
