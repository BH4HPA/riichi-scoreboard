import { describe, expect, it } from "vitest";
import { validateRecognitionSession, validateRecognitionPatch } from "./validate";

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
      modelId: "12b2722c-cbce-4e9b-9bd1-341280bd0204",
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
    expect(p.modelId).toBe("12b2722c-cbce-4e9b-9bd1-341280bd0204");
    expect(p.ms).toBe(812);
    expect(p.detections).toHaveLength(1);
    expect(p.recognized?.winTile).toBe(0);
    expect(p.corrected).toBeUndefined();
    expect(validateRecognitionPatch({ corrected: hand }).corrected?.winTile).toBe(9);
  });

  it("未知字段忽略而不是 400：旧版手机还会带 engine，检测框与识别结果照收", () => {
    const p = validateRecognitionPatch({ engine: "browser", ms: 1 });
    expect(p).toEqual({ ms: 1 });
  });

  it("拒绝：空体、坏模型 id、负耗时、检测框过多/NaN/越界类、非法手牌", () => {
    expect(() => validateRecognitionPatch({})).toThrow();
    expect(() => validateRecognitionPatch({ modelId: "v1" })).toThrow();
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
    expect(() =>
      validateRecognitionPatch({ detections: [{ cls: 0, conf: 1, box: [5, 5, 5, 9] }] }),
    ).toThrow(/检测框/);
    expect(() => validateRecognitionPatch({ corrected: { ...hand, winTile: 99 } })).toThrow(/和张/);
    expect(() =>
      validateRecognitionPatch({
        recognized: { closed: [40], melds: [], winTile: 0, doraIndicators: [], uraIndicators: [] },
      }),
    ).toThrow();
  });
});

describe("validateRecognitionSession", () => {
  const summary = {
    source: "calc",
    outcome: "abandoned",
    modelId: "d1ec564d-e44a-404e-9140-cf9ea22d1366",
    durationMs: 18_400,
    frames: 52,
    settledFrames: 40,
    secondPasses: 3,
    msAvg: 236,
    blocking: { count: 31, indicator_mismatch: 2 },
    keyChanges: 17,
    maxVotes: 2,
    rotation: 90,
    rotationSource: "gyro",
    video: "1080x1920",
    viewport: "390x844",
  };

  it("原样通过；没出过帧、模型没发布也是合法的摘要", () => {
    expect(validateRecognitionSession(summary)).toEqual(summary);
    const empty = { ...summary, modelId: null, frames: 0, blocking: {}, video: "0x0" };
    expect(validateRecognitionSession(empty)).toEqual(empty);
  });

  it.each([
    ["来源", { source: "tv" }],
    ["收场方式", { outcome: "crashed" }],
    ["计数为负", { frames: -1 }],
    ["计数非整数", { keyChanges: 1.5 }],
    ["不认识的告警码", { blocking: { whatever: 1 } }],
    ["方向", { rotation: 180 }],
    ["尺寸格式", { video: "1080*1920" }],
    ["模型 id", { modelId: "v1" }],
  ])("拒收：%s", (_, over) => {
    expect(() => validateRecognitionSession({ ...summary, ...over })).toThrow();
  });

  it("多出来的字段不落库", () => {
    expect(validateRecognitionSession({ ...summary, photo: "x" })).toEqual(summary);
  });
});
