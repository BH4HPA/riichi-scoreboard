import { describe, expect, it } from "vitest";
import { SAMPLE_AFTER_MS, validateRecognitionSample } from "@riichi/core";
import type { Sampled } from "../../worker/protocol";
import { sampleMeta, wantsSamples } from "./upload";

describe("wantsSamples", () => {
  it("放弃的一律留；定格了的只留首帧到定格超过 SAMPLE_AFTER_MS 的；一帧都没出过的不留", () => {
    expect(wantsSamples("abandoned", 1000, null)).toBe(true);
    expect(wantsSamples("auto", 1000, 1000 + SAMPLE_AFTER_MS)).toBe(false);
    expect(wantsSamples("manual", 1000, 1001 + SAMPLE_AFTER_MS)).toBe(true);
    expect(wantsSamples("album", 1000, null)).toBe(false);
    expect(wantsSamples("abandoned", null, null)).toBe(false);
  });
});

describe("sampleMeta", () => {
  it("拼出的元数据能过服务端的校验，t 从首帧起算", () => {
    const s: Sampled = {
      frameId: 7,
      blob: new Blob(),
      ms: 240,
      detections: [{ cls: 0, conf: 0.9, box: [1, 2, 30, 40] }],
      hand: { closed: [1, 2, 3], melds: [], winTile: 3, doraIndicators: [], uraIndicators: [] },
      warnings: [{ code: "count", message: "只认出 3 张", severity: "blocking" }],
      settled: true,
      passes: 2,
      rotation: 90,
      frame: { width: 1920, height: 1080 },
    };
    const meta = sampleMeta(s, 5_400.6, 1_000, null);
    expect(meta.t).toBe(4_401);
    expect(validateRecognitionSample(meta)).toEqual(meta);
  });
});
