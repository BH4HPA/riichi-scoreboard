import { describe, expect, it } from "vitest";
import { myDiffs } from "./diffRows";

describe("myDiffs", () => {
  it("按点数从高到低列出其余三家，正数为我领先", () => {
    expect(myDiffs([30000, 22000, 25000, 23000], 3)).toEqual([
      { seat: 0, diff: -7000 },
      { seat: 2, diff: -2000 },
      { seat: 1, diff: 1000 },
    ]);
  });
});
