import { describe, expect, it } from "vitest";
import { validateRecognitionPatch } from "./validate";

const hand = {
  closed: [1, 2, 3, 13, 36, 15, 25, 26, 27, 7, 8, 11, 11, 9],
  melds: [],
  winTile: 9,
  tsumo: false,
  doraIndicators: [24],
  uraIndicators: [],
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  afterKan: false,
  lastTile: false,
  firstTake: false,
};

describe("validateRecognitionPatch", () => {
  it("只保留给出的字段", () => {
    const p = validateRecognitionPatch({
      engine: "browser",
      ms: 812,
      detections: [{ cls: 0, conf: 0.9, box: [1, 2, 3, 4] }],
      recognized: {
        closed: [1, 2],
        melds: [{ open: true, tiles: [5, 5, 5] }],
        winTile: 0,
        doraIndicators: [],
        uraIndicators: [],
      },
    });
    expect(p.engine).toBe("browser");
    expect(p.ms).toBe(812);
    expect(p.detections).toHaveLength(1);
    expect(p.recognized?.winTile).toBe(0);
    expect(p.corrected).toBeUndefined();
    expect(validateRecognitionPatch({ corrected: hand }).corrected?.winTile).toBe(9);
  });

  it("拒绝：空体、坏引擎、负耗时、检测框过多/NaN/越界类、非法手牌", () => {
    expect(() => validateRecognitionPatch({})).toThrow();
    expect(() => validateRecognitionPatch({ engine: "gpu" })).toThrow();
    expect(() => validateRecognitionPatch({ ms: -1 })).toThrow();
    expect(() =>
      validateRecognitionPatch({
        detections: Array.from({ length: 301 }, () => ({ cls: 0, conf: 1, box: [0, 0, 1, 1] })),
      }),
    ).toThrow();
    expect(() =>
      validateRecognitionPatch({ detections: [{ cls: 0, conf: NaN, box: [0, 0, 1, 1] }] }),
    ).toThrow();
    expect(() =>
      validateRecognitionPatch({ detections: [{ cls: 38, conf: 1, box: [0, 0, 1, 1] }] }),
    ).toThrow();
    expect(() => validateRecognitionPatch({ corrected: { ...hand, winTile: 99 } })).toThrow(/和张/);
    expect(() =>
      validateRecognitionPatch({
        recognized: { closed: [40], melds: [], winTile: 0, doraIndicators: [], uraIndicators: [] },
      }),
    ).toThrow();
  });
});
