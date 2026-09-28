import { describe, expect, it } from "vitest";
import { SAMPLE_GAP_MS, SAMPLE_MAX, type RecognitionWarning } from "@riichi/core";
import {
  EMPTY_SAMPLER,
  nextSample,
  recordSample,
  signatureOf,
  type SampleFrame,
  type SamplerState,
} from "./sampler";

const hand = (winTile: number) => ({
  closed: [1, 2, 3],
  melds: [],
  winTile,
  doraIndicators: [],
  uraIndicators: [],
});
const blocking = (code: RecognitionWarning["code"]): RecognitionWarning => ({
  code,
  message: "",
  severity: "blocking",
});

const unsettled: SampleFrame = { settled: false, warnings: [], hand: hand(1) };
const count: SampleFrame = { settled: true, warnings: [blocking("count")], hand: hand(1) };
const handA: SampleFrame = { settled: true, warnings: [], hand: hand(1) };
const handB: SampleFrame = { settled: true, warnings: [], hand: hand(2) };

/** 按时刻喂一串帧，每帧照 nextSample 的判断落位；item 记帧的时刻 */
function run(frames: [number, SampleFrame][]): SamplerState<number> {
  let s: SamplerState<number> = EMPTY_SAMPLER;
  for (const [t, f] of frames) {
    const action = nextSample(s, f, t);
    if (action) s = recordSample(s, action, f, t, t);
  }
  return s;
}

describe("signatureOf", () => {
  it("没收紧 / 第一条 blocking / 牌面指纹；info 告警不算状态", () => {
    expect(signatureOf(unsettled)).toBe("unsettled");
    expect(signatureOf(count)).toBe("block:count");
    expect(
      signatureOf({ ...handA, warnings: [{ code: "odd_box", message: "", severity: "info" }] }),
    ).toBe(signatureOf(handA));
    expect(signatureOf(handA)).not.toBe(signatureOf(handB));
  });
});

describe("nextSample / recordSample", () => {
  it("首帧直接采；间隔不足 SAMPLE_GAP_MS 的一律不采，状态变了也不采", () => {
    expect(nextSample(EMPTY_SAMPLER, count, 0)).toBe("new");
    const s = run([[0, count]]);
    expect(nextSample(s, handA, SAMPLE_GAP_MS - 1)).toBeNull();
    expect(nextSample(s, count, SAMPLE_GAP_MS - 1)).toBeNull();
  });

  it("状态没变：只有首帧时新开（首帧不覆盖），之后覆盖最后一帧", () => {
    const g = SAMPLE_GAP_MS;
    const s = run([
      [0, count],
      [g, count],
      [2 * g, count],
      [3 * g, count],
    ]);
    expect(s.slots.map((x) => x.item)).toEqual([0, 3 * g]);
  });

  it("状态变了新开；覆盖也受节流，节流期间的帧不挪动 lastAt", () => {
    const g = SAMPLE_GAP_MS;
    const s = run([
      [0, unsettled],
      [g, count],
      [g + 10, handA], // 节流中：丢
      [2 * g, handA],
      [2 * g + 500, handA], // 节流中：丢
      [3 * g, handA], // 覆盖 handA 那一帧
    ]);
    expect(s.slots.map((x) => [x.sig, x.item])).toEqual([
      ["unsettled", 0],
      ["block:count", g],
      [signatureOf(handA), 3 * g],
    ]);
    expect(s.lastAt).toBe(3 * g);
  });

  it(`超过 ${SAMPLE_MAX} 帧时丢第二帧：首帧与最近的几帧留下`, () => {
    const g = SAMPLE_GAP_MS;
    // 每帧状态都变：handA / handB 交替
    const frames: [number, SampleFrame][] = Array.from({ length: SAMPLE_MAX + 2 }, (_, i) => [
      i * g,
      i % 2 ? handB : handA,
    ]);
    const s = run(frames);
    expect(s.slots).toHaveLength(SAMPLE_MAX);
    expect(s.slots.map((x) => x.item)).toEqual([0, ...frames.slice(3).map(([t]) => t)]);
  });
});
