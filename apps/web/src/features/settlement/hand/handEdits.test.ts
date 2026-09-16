import { describe, expect, it } from "vitest";
import { AKA, TILE, type HandInput } from "@riichi/core";
import { emptyHand } from "../valueDraft";
import { replaceAt, tileAt, withWinTile } from "./handEdits";

const hand: HandInput = {
  ...emptyHand(false),
  closed: [TILE.M1, TILE.M2, TILE.M9, TILE.M9],
  melds: [{ open: true, tiles: [AKA.P5, TILE.P6, TILE.P7] }],
  winTile: TILE.M9,
  doraIndicators: [TILE.S6],
  uraIndicators: [TILE.East],
};

describe("tileAt", () => {
  it("四个区域都能寻址，越界给 null", () => {
    expect(tileAt(hand, { area: "closed", i: 1 })).toBe(TILE.M2);
    expect(tileAt(hand, { area: "meld", i: 0, j: 0 })).toBe(AKA.P5);
    expect(tileAt(hand, { area: "dora", i: 0 })).toBe(TILE.S6);
    expect(tileAt(hand, { area: "ura", i: 0 })).toBe(TILE.East);
    expect(tileAt(hand, { area: "closed", i: 9 })).toBeNull();
    expect(tileAt(hand, { area: "meld", i: 3, j: 0 })).toBeNull();
  });
});

describe("replaceAt", () => {
  it("张数不变，只换身份", () => {
    const next = replaceAt(hand, { area: "closed", i: 0 }, TILE.S3);
    expect(next.closed).toEqual([TILE.S3, TILE.M2, TILE.M9, TILE.M9]);
    expect(next.closed).toHaveLength(hand.closed.length);
  });

  it("换掉的是和张：还有同码的另一张时和张仍成立", () => {
    const next = replaceAt(hand, { area: "closed", i: 2 }, TILE.S3);
    expect(next.closed).toEqual([TILE.M1, TILE.M2, TILE.S3, TILE.M9]);
    expect(next.winTile).toBe(TILE.M9);
  });

  it("换掉最后一张和张：和张跟着变，不会指向手里没有的牌", () => {
    const single = { ...hand, closed: [TILE.M1, TILE.M9], winTile: TILE.M9 };
    const next = replaceAt(single, { area: "closed", i: 1 }, TILE.S3);
    expect(next.closed).toEqual([TILE.M1, TILE.S3]);
    expect(next.winTile).toBe(TILE.S3);
    expect(next.closed).toContain(next.winTile);
  });

  it("副露只改那一张，其余组不动", () => {
    const next = replaceAt(hand, { area: "meld", i: 0, j: 0 }, TILE.P5);
    expect(next.melds[0]!.tiles).toEqual([TILE.P5, TILE.P6, TILE.P7]);
    expect(next.closed).toEqual(hand.closed);
  });

  it("指示牌两行各自替换", () => {
    expect(replaceAt(hand, { area: "dora", i: 0 }, TILE.S9).doraIndicators).toEqual([TILE.S9]);
    expect(replaceAt(hand, { area: "ura", i: 0 }, TILE.S9).uraIndicators).toEqual([TILE.S9]);
  });
});

describe("withWinTile", () => {
  it("把和张改指到暗牌的某一格", () => {
    expect(withWinTile(hand, 0).winTile).toBe(TILE.M1);
  });

  it("越界不动", () => {
    expect(withWinTile(hand, 9)).toEqual(hand);
  });
});
