import { describe, expect, it } from "vitest";
import { AKA, MLEAGUE_RULES, TILE, type RecognitionResult, type RoomRules } from "@riichi/core";
import { createValueDraft } from "../settlement/valueDraft";
import { applyRecognized } from "./applyRecognized";

const result: RecognitionResult = {
  engine: "browser",
  modelId: "m",
  ms: 812,
  detections: [],
  hand: {
    closed: [TILE.M1, AKA.P5, TILE.M9],
    melds: [{ open: true, tiles: [AKA.S5, TILE.S6, TILE.S7] }],
    winTile: TILE.M9,
    doraIndicators: [TILE.S6, TILE.S3],
    uraIndicators: [TILE.P8],
  },
  warnings: [{ code: "count", message: "x" }],
};

describe("applyRecognized", () => {
  it("切到牌面模式、替换牌、清空评估；旗标保留；未立直时里宝清空并提示", () => {
    const draft = { ...createValueDraft(true), evaluated: null };
    draft.hand.afterKan = true;
    const next = applyRecognized(draft, result, MLEAGUE_RULES);
    expect(next.mode).toBe("hand");
    expect(next.hand.closed).toEqual([TILE.M1, AKA.P5, TILE.M9]);
    expect(next.hand.melds[0]!.tiles).toEqual([AKA.S5, TILE.S6, TILE.S7]);
    expect(next.hand.tsumo).toBe(true);
    expect(next.hand.afterKan).toBe(true);
    expect(next.hand.doraIndicators).toEqual([TILE.S6, TILE.S3]);
    expect(next.hand.uraIndicators).toEqual([]);
    expect(next.evaluated).toBeNull();
    expect(next.recognition).toMatchObject({ id: null, engine: "browser", ms: 812 });
    expect(next.recognition!.warnings.map((w) => w.code)).toEqual(["count", "extra_rows"]);
  });

  it("立直时保留里宝（不超过宝牌数）", () => {
    const draft = createValueDraft(false);
    draft.hand.riichi = true;
    const next = applyRecognized(draft, result, MLEAGUE_RULES);
    expect(next.hand.uraIndicators).toEqual([TILE.P8]);
  });

  it("不用赤五的规则：赤五折回普通五；不开杠宝：宝牌指示牌截到 1 张并提示", () => {
    const rules: RoomRules = {
      ...MLEAGUE_RULES,
      hand: { ...MLEAGUE_RULES.hand, akaCount: 0, kanDora: false },
    };
    const next = applyRecognized(createValueDraft(false), result, rules);
    expect(next.hand.closed).toEqual([TILE.M1, TILE.P5, TILE.M9]);
    expect(next.hand.melds[0]!.tiles[0]).toBe(TILE.S5);
    expect(next.hand.doraIndicators).toEqual([TILE.S6]);
    expect(next.recognition!.warnings.map((w) => w.code)).toContain("too_many_dora");
  });
});
