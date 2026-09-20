import { describe, expect, it } from "vitest";
import type { PlayerRef } from "@riichi/core";
import { canPickFor } from "./canPick";

const device = (id: string): PlayerRef => ({ id, name: id, avatar: null, kind: "device" });
const local = (id: string): PlayerRef => ({ id, name: id, avatar: null, kind: "local" });
const stage = { kind: "B" as const, attacker: 0 as const, riichi: true, marked: [] };

describe("谁可以在全牌型板上划牌", () => {
  it("设备玩家的事由本人做：防守方自己的手机可以，进攻方、没入座的手机、主控台都只读", () => {
    const seats = [device("a"), device("b")];
    expect(canPickFor(stage, seats, 1)).toBe(true);
    expect(canPickFor(stage, seats, 0)).toBe(false);
    expect(canPickFor(stage, seats, null)).toBe(false);
  });

  it("防守方是本地玩家（没有手机）：任何端都可以代做", () => {
    const seats = [device("a"), local("l")];
    expect(canPickFor(stage, seats, null)).toBe(true);
    expect(canPickFor(stage, seats, 0)).toBe(true);
  });
});
