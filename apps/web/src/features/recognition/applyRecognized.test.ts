import { describe, expect, it } from "vitest";
import { AKA, MLEAGUE_RULES, TILE, type RecognitionResult, type RoomRules } from "@riichi/core";
import { createValueDraft } from "../settlement/valueDraft";
import { applyRecognized } from "./applyRecognized";

const result: RecognitionResult = {
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
  it("切到牌面模式、替换牌、清空评估；旗标保留；认出里宝即勾选立直并提示", () => {
    const draft = { ...createValueDraft(true), evaluated: null };
    draft.hand.afterKan = true;
    const next = applyRecognized(draft, result, MLEAGUE_RULES, "k1");
    expect(next.mode).toBe("hand");
    expect(next.hand.closed).toEqual([TILE.M1, AKA.P5, TILE.M9]);
    expect(next.hand.melds[0]!.tiles).toEqual([AKA.S5, TILE.S6, TILE.S7]);
    expect(next.hand.tsumo).toBe(true);
    expect(next.hand.afterKan).toBe(true);
    expect(next.hand.doraIndicators).toEqual([TILE.S6, TILE.S3]);
    expect(next.hand.uraIndicators).toEqual([TILE.P8]);
    expect(next.hand.riichi).toBe(true);
    expect(next.evaluated).toBeNull();
    expect(next.recognition).toMatchObject({ key: "k1", id: null, ms: 812 });
    expect(next.recognition!.warnings.map((w) => w.code)).toEqual(["count", "extra_rows"]);
  });

  it("已勾立直时里宝照常保留，不重复提示", () => {
    const draft = createValueDraft(false);
    draft.hand.riichi = true;
    const next = applyRecognized(draft, result, MLEAGUE_RULES, "k2");
    expect(next.hand.uraIndicators).toEqual([TILE.P8]);
    expect(next.recognition!.warnings.map((w) => w.code)).toEqual(["count"]);
  });

  it("不用赤五、不开杠宝、无里宝的规则：赤五折回、宝牌截到 1 张、里宝丢弃并提示", () => {
    const rules: RoomRules = {
      ...MLEAGUE_RULES,
      hand: { ...MLEAGUE_RULES.hand, akaCount: 0, kanDora: false, uraDora: false },
    };
    const next = applyRecognized(createValueDraft(false), result, rules, "k3");
    expect(next.hand.closed).toEqual([TILE.M1, TILE.P5, TILE.M9]);
    expect(next.hand.melds[0]!.tiles[0]).toBe(TILE.S5);
    expect(next.hand.doraIndicators).toEqual([TILE.S6]);
    expect(next.hand.uraIndicators).toEqual([]);
    expect(next.hand.riichi).toBe(false);
    expect(next.recognition!.warnings.map((w) => w.code)).toEqual([
      "count",
      "too_many_dora",
      "extra_rows",
    ]);
  });
});
