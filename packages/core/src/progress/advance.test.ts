import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { GameState } from "../types/state";
import { DomainError, advance } from "./advance";

const R = MLEAGUE_RULES;

function game(partial: Partial<GameState> = {}): GameState {
  return {
    status: "playing",
    points: [25000, 25000, 25000, 25000],
    kyotaku: 0,
    honba: 0,
    kyoku: 0,
    dealer: 0,
    history: [],
    tobi: null,
    startedAt: 0,
    finishedAt: null,
    final: null,
    ...partial,
  };
}

describe("advance", () => {
  it("闲家和：轮庄、本场清零", () => {
    const g = advance(game({ honba: 2 }), { kind: "win", dealerWon: false }, R);
    expect([g.kyoku, g.honba, g.dealer, g.status]).toEqual([1, 0, 1, "playing"]);
  });
  it("庄家和：连庄、本场 +1", () => {
    const g = advance(game({ honba: 2 }), { kind: "win", dealerWon: true }, R);
    expect([g.kyoku, g.honba, g.dealer]).toEqual([0, 3, 0]);
  });
  it("流局：本场 +1，庄家听牌连庄 / 不听轮庄", () => {
    expect(advance(game(), { kind: "draw", dealerTenpai: true }, R).honba).toBe(1);
    const g = advance(game(), { kind: "draw", dealerTenpai: false }, R);
    expect([g.kyoku, g.honba, g.dealer]).toEqual([1, 1, 1]);
  });
  it("途中流局：连庄本场 +1；错和：不变", () => {
    expect(advance(game(), { kind: "abortive" }, R).honba).toBe(1);
    expect(advance(game({ honba: 3 }), { kind: "chombo" }, R).honba).toBe(3);
  });
  it("南4 闲家和 → 终局；庄家和 → 继续", () => {
    expect(
      advance(game({ kyoku: 7, dealer: 3 }), { kind: "win", dealerWon: false }, R).status,
    ).toBe("finished");
    expect(advance(game({ kyoku: 7, dealer: 3 }), { kind: "win", dealerWon: true }, R).status).toBe(
      "playing",
    );
  });
  it("东风战在东4 结束", () => {
    const east = { ...R, progress: { ...R.progress, length: "east" as const } };
    expect(
      advance(game({ kyoku: 3, dealer: 3 }), { kind: "draw", dealerTenpai: false }, east).status,
    ).toBe("finished");
  });

  describe("击飞", () => {
    const tobi = (threshold: "below0" | "at0") => ({
      ...R,
      progress: { ...R.progress, tobi: { enabled: true, threshold, bonus: 0 } },
    });
    it("below0：负分终局，0 分继续", () => {
      expect(
        advance(
          game({ points: [50000, 25000, 25000, 0] }),
          { kind: "win", dealerWon: true },
          tobi("below0"),
        ).status,
      ).toBe("playing");
      expect(
        advance(
          game({ points: [50100, 25000, 25000, -100] }),
          { kind: "win", dealerWon: true },
          tobi("below0"),
        ).status,
      ).toBe("finished");
    });
    it("at0：0 分即终局", () => {
      expect(
        advance(
          game({ points: [50000, 25000, 25000, 0] }),
          { kind: "win", dealerWon: true },
          tobi("at0"),
        ).status,
      ).toBe("finished");
    });
    it("M-League 无击飞", () => {
      expect(
        advance(
          game({ points: [60000, 25000, 25000, -10000] }),
          { kind: "win", dealerWon: true },
          R,
        ).status,
      ).toBe("playing");
    });
  });

  describe("西入", () => {
    const ench = {
      ...R,
      progress: { ...R.progress, enchousen: { enabled: true, threshold: 30000 } },
    };
    it("南4 结束无人 30000 → 西1", () => {
      const g = advance(
        game({ kyoku: 7, dealer: 3, points: [29000, 27000, 24000, 20000] }),
        { kind: "win", dealerWon: false },
        ench,
      );
      expect([g.status, g.kyoku, g.dealer]).toEqual(["playing", 8, 0]);
    });
    it("南4 结束有人 30000 → 终局", () => {
      const g = advance(
        game({ kyoku: 7, dealer: 3, points: [30000, 27000, 24000, 19000] }),
        { kind: "win", dealerWon: false },
        ench,
      );
      expect(g.status).toBe("finished");
    });
    it("西场中任一局结束有人 30000 → 终局（含连庄）", () => {
      const g = advance(
        game({ kyoku: 8, dealer: 0, points: [31000, 27000, 24000, 18000] }),
        { kind: "win", dealerWon: true },
        ench,
      );
      expect(g.status).toBe("finished");
    });
    it("西4 仍无人达标 → 终局", () => {
      const g = advance(
        game({ kyoku: 11, dealer: 3, points: [29000, 27000, 24000, 20000] }),
        { kind: "draw", dealerTenpai: false },
        ench,
      );
      expect(g.status).toBe("finished");
    });
  });

  describe("和了止", () => {
    const yame = { ...R, progress: { ...R.progress, agariYame: true, tenpaiYame: true } };
    it("最终局庄家和且唯一一位可结束", () => {
      const g = advance(
        game({ kyoku: 7, dealer: 3, points: [20000, 25000, 25000, 30000] }),
        { kind: "win", dealerWon: true },
        yame,
        true,
      );
      expect(g.status).toBe("finished");
    });
    it("非一位不可结束", () => {
      expect(() =>
        advance(
          game({ kyoku: 7, dealer: 3, points: [40000, 20000, 20000, 20000] }),
          { kind: "win", dealerWon: true },
          yame,
          true,
        ),
      ).toThrow(DomainError);
    });
    it("M-League 不允许", () => {
      expect(() =>
        advance(
          game({ kyoku: 7, dealer: 3, points: [20000, 25000, 25000, 30000] }),
          { kind: "win", dealerWon: true },
          R,
          true,
        ),
      ).toThrow(DomainError);
    });
    it("听牌止", () => {
      const g = advance(
        game({ kyoku: 7, dealer: 3, points: [20000, 25000, 25000, 30000] }),
        { kind: "draw", dealerTenpai: true },
        yame,
        true,
      );
      expect(g.status).toBe("finished");
    });
  });
});
