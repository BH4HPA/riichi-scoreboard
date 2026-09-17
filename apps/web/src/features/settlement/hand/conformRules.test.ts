import { describe, expect, it } from "vitest";
import { AKA, MLEAGUE_RULES, TILE, type RoomRules } from "@riichi/core";
import { createValueDraft, type ValueDraft } from "../valueDraft";
import { conformDraftToRules } from "./conformRules";

const withHand = (patch: Partial<RoomRules["hand"]>): RoomRules => ({
  ...MLEAGUE_RULES,
  hand: { ...MLEAGUE_RULES.hand, ...patch },
});

function draft(): ValueDraft {
  const d = createValueDraft(false, "hand");
  return {
    ...d,
    hand: {
      ...d.hand,
      // 和张是末尾那张赤5筒
      closed: [TILE.M1, TILE.M2, TILE.M3, TILE.P4, TILE.P6, TILE.S7, TILE.S8, TILE.S9, AKA.P5],
      melds: [{ open: true, tiles: [AKA.S5, TILE.S6, TILE.S7] }],
      winTile: AKA.P5,
      doraIndicators: [AKA.M5, TILE.S3],
      uraIndicators: [TILE.S1, TILE.S2],
      riichi: true,
      ippatsu: true,
    },
    recognition: {
      key: "k",
      id: null,
      ms: 1,
      warnings: [],
      uncertain: [
        { area: "dora", i: 1 },
        { area: "closed", i: 0 },
      ],
    },
  };
}

describe("conformDraftToRules", () => {
  it("规则允许时原样返回同一个对象", () => {
    const d = draft();
    expect(conformDraftToRules(d, MLEAGUE_RULES)).toBe(d);
  });

  it("无赤、无杠宝、无里宝、无一发：赤五折回（和张跟着折）、指示牌截断、清里宝与一发", () => {
    const next = conformDraftToRules(
      draft(),
      withHand({ akaCount: 0, kanDora: false, uraDora: false, ippatsu: false }),
    );
    expect(next.hand.closed.at(-1)).toBe(TILE.P5);
    expect(next.hand.winTile).toBe(TILE.P5);
    expect(next.hand.melds[0]!.tiles[0]).toBe(TILE.S5);
    expect(next.hand.doraIndicators).toEqual([TILE.M5]);
    expect(next.hand.uraIndicators).toEqual([]);
    expect(next.hand.ippatsu).toBe(false);
    expect(next.hand.riichi).toBe(true);
    expect(next.evaluated).toBeNull();
    // 截掉的第二张宝牌指示牌不留悬空记号；赤 0 全折不打记号
    expect(next.recognition!.uncertain).toEqual([{ area: "closed", i: 0 }]);
  });

  it("赤五超出每色上限：折回并把该花色标成要核对", () => {
    const d = draft();
    const two = {
      ...d,
      hand: {
        ...d.hand,
        closed: [...d.hand.closed.slice(0, 3), AKA.P5, ...d.hand.closed.slice(4)],
      },
    };
    const next = conformDraftToRules(two, MLEAGUE_RULES);
    expect(next.hand.closed.filter((t) => t === AKA.P5)).toHaveLength(1);
    expect(next.recognition!.uncertain).toEqual(
      expect.arrayContaining([
        { area: "closed", i: 3 },
        { area: "closed", i: 8 },
      ]),
    );
  });
});
