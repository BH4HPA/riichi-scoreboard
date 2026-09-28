import { describe, expect, it } from "vitest";
import {
  isRecognitionSessionId,
  validateRecognitionPatch,
  validateRecognitionSample,
  validateRecognitionSession,
} from "./validate";

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

  it("会话 id 可选（旧前端不带）；带了就必须是 16 位小写 hex", () => {
    const id = "0123456789abcdef";
    expect(validateRecognitionSession({ ...summary, id })).toEqual({ ...summary, id });
    expect(validateRecognitionSession(summary)).not.toHaveProperty("id");
    for (const bad of ["0123456789ABCDEF", "0123456789abcde", "../../etc/passwd", 42, null])
      expect(() => validateRecognitionSession({ ...summary, id: bad })).toThrow(/会话 id/);
    expect(isRecognitionSessionId(id)).toBe(true);
    expect(isRecognitionSessionId(`${id}0`)).toBe(false);
  });
});

describe("validateRecognitionSample", () => {
  const meta = {
    modelId: "d1ec564d-e44a-404e-9140-cf9ea22d1366",
    t: 4_200,
    ms: 280,
    frame: { width: 1080, height: 1920 },
    rotation: 0,
    settled: false,
    passes: 2,
    detections: [{ cls: 0, conf: 0.9, box: [10, 20, 50, 76] }],
    // 没过闸门：一整排牌都可能被当成暗牌
    hand: {
      closed: Array.from({ length: 20 }, (_, i) => (i % 34) + 1),
      melds: [],
      winTile: 20,
      doraIndicators: [],
      uraIndicators: [],
    },
    warnings: [{ code: "count", message: "认出 20 张，多了 6 张", severity: "blocking" }],
  };

  it("原样通过；多出来的字段不落库", () => {
    expect(validateRecognitionSample(meta)).toEqual(meta);
    expect(validateRecognitionSample({ ...meta, seq: 3 })).toEqual(meta);
    expect(validateRecognitionSample({ ...meta, modelId: null }).modelId).toBeNull();
  });

  const warning = { code: "count", message: "x", severity: "info" };
  it.each([
    ["不是对象", null],
    ["暗牌超过 34 张", { hand: { ...meta.hand, closed: Array<number>(35).fill(1) } }],
    [
      "检测框超过上限",
      { detections: Array.from({ length: 301 }, () => ({ cls: 0, conf: 1, box: [0, 0, 1, 1] })) },
    ],
    ["告警超过 20 条", { warnings: Array<unknown>(21).fill(warning) }],
    ["不认识的告警码", { warnings: [{ ...warning, code: "whatever" }] }],
    ["告警文案过长", { warnings: [{ ...warning, message: "长".repeat(201) }] }],
    ["告警级别", { warnings: [{ ...warning, severity: "fatal" }] }],
    ["画面尺寸为 0", { frame: { width: 0, height: 1920 } }],
    ["画面尺寸离谱", { frame: { width: 100_000, height: 1920 } }],
    ["方向", { rotation: 180 }],
    ["settled 不是布尔", { settled: 1 }],
    ["推理遍数", { passes: -1 }],
    ["耗时非整数", { ms: 1.5 }],
    ["时刻为负", { t: -1 }],
    ["模型 id", { modelId: "v1" }],
  ])("拒收：%s", (_, over) => {
    expect(() => validateRecognitionSample(over === null ? null : { ...meta, ...over })).toThrow();
  });
});
