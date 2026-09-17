import { describe, expect, it } from "vitest";
import type { PlayerRef } from "@riichi/core";
import { startBlocker } from "./startBlocker";

const p: PlayerRef = { id: "a", name: "甲", avatar: null, kind: "device" };

describe("startBlocker", () => {
  it("先报缺人，再报未准备，都齐了为 null", () => {
    expect(startBlocker({ seats: [p, null, null, p], ready: [true, false, false, false] })).toBe(
      "还差 2 人入座",
    );
    expect(startBlocker({ seats: [p, p, p, p], ready: [true, false, true, false] })).toBe(
      "2 人未准备",
    );
    expect(startBlocker({ seats: [p, p, p, p], ready: [true, true, true, true] })).toBeNull();
  });
});
