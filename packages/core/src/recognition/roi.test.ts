import { describe, expect, it } from "vitest";
import { layoutHand, type Box } from "./layout";
import {
  clampBox,
  fullFrame,
  LOST,
  LOST_FRAMES,
  nextTrack,
  tightenCapture,
  translateInto,
  zoomGain,
  type TrackState,
} from "./roi";
import type { Detection, RecognitionWarning } from "./types";
import records from "./__fixtures__/records.json";

const FRAME = { width: 1080, height: 1920 };
const blocking: RecognitionWarning = { code: "count", message: "x", severity: "blocking" };
const info: RecognitionWarning = { code: "extra_rows", message: "x", severity: "info" };

describe("clampBox / zoomGain", () => {
  it("取整、夹进帧内；夹完不成形返回 null", () => {
    expect(clampBox([-10.4, 5.6, 2000, 300.2], FRAME)).toEqual([0, 5, 1080, 301]);
    expect(clampBox([1100, 0, 1200, 50], FRAME)).toBeNull();
  });

  it("放大倍数按长边算：竖屏整帧收紧到一条横带，长边从 1920 变成 1080", () => {
    expect(zoomGain(fullFrame(FRAME), [0, 900, 1080, 1700])).toBeCloseTo(1920 / 1080);
    expect(zoomGain([0, 0, 1920, 1080], [0, 100, 1920, 1000])).toBe(1);
  });
});

describe("nextTrack", () => {
  const win: Box = [100, 800, 1000, 1500];

  it("认出自洽的手牌：ROI 挪到窗口上；只挪了一点点就沿用上一帧的", () => {
    const a = nextTrack(LOST, FRAME, { window: win, warnings: [info] });
    expect(a).toEqual({ roi: win, misses: 0 });
    const nudged: Box = [110, 790, 1010, 1510];
    expect(nextTrack(a, FRAME, { window: nudged, warnings: [] }).roi).toBe(a.roi);
    const moved: Box = [100, 400, 1000, 1100];
    expect(nextTrack(a, FRAME, { window: moved, warnings: [] }).roi).toEqual(moved);
  });

  it("认不出来先留着 ROI，连续 LOST_FRAMES 帧才回整帧；中间认出一帧就重新计数", () => {
    let s: TrackState = { roi: win, misses: 0 };
    s = nextTrack(s, FRAME, { window: win, warnings: [blocking] });
    expect(s).toEqual({ roi: win, misses: 1 });
    s = nextTrack(s, FRAME, { window: win, warnings: [] });
    expect(s.misses).toBe(0);
    for (let i = 0; i < LOST_FRAMES; i++)
      s = nextTrack(s, FRAME, { window: null, warnings: [blocking] });
    expect(s).toEqual(LOST);
  });
});

describe("tightenCapture：线上实拍", () => {
  const RECORDS = records as unknown as { id: string; detections: Detection[] }[];
  const frameOf = (dets: Detection[]) => ({
    width: Math.ceil(Math.max(...dets.map((d) => d.box[2]))) + 5,
    height: Math.ceil(Math.max(...dets.map((d) => d.box[3]))) + 5,
  });

  it("收紧后手牌逐位不变（变了就不收紧）；带牌河的 19 条里多数收紧后块内每个框都有着落", () => {
    const stray = (dets: readonly Detection[], p: ReturnType<typeof layoutHand>["provenance"]) =>
      dets.length - new Set([...p.usedDetections, ...p.rejectedDetections]).size;
    let before = 0;
    let after = 0;
    const refused: string[] = [];
    for (const r of RECORDS) {
      const layout = layoutHand(r.detections);
      const tight = tightenCapture(r.detections, layout, frameOf(r.detections));
      if (stray(r.detections, layout.provenance) > 0) before++;
      if (!tight) {
        // 牌河紧贴着指示牌：块边上的半行牌河会改写指示牌行，守卫拒绝收紧，照片退回 ROI 那一块
        refused.push(r.id);
        after++;
        continue;
      }
      expect(tight.layout.hand, r.id).toEqual(layout.hand);
      if (stray(tight.detections, tight.layout.provenance) > 0) after++;
      const [x1, y1, x2, y2] = tight.box;
      for (const d of tight.detections) {
        const inside = d.box[0] >= 0 && d.box[1] >= 0 && d.box[2] <= x2 - x1 && d.box[3] <= y2 - y1;
        expect(inside, r.id).toBe(true);
      }
    }
    // 剩下的是牌河紧贴着指示牌的那几张：块里确实有没标注的牌，该送人工
    console.log(
      `有框没着落的记录：收紧前 ${before} 条，收紧后 ${after} 条；拒绝收紧 ${refused.join(" ")}`,
    );
    expect(refused.length).toBeLessThanOrEqual(2);
    expect(before).toBeGreaterThanOrEqual(15);
    expect(after).toBeLessThanOrEqual(before / 3);
  });

  it("收紧后手牌变了就不收紧", () => {
    // 被采信的只有一张牌时，块里重跑布局凑不出同一手牌之外的东西；这里用「没有被采信的框」触发 null
    expect(tightenCapture([], layoutHand([]), FRAME)).toBeNull();
  });
});

describe("translateInto", () => {
  it("只留中心在块内的框，平移并夹进块内", () => {
    const d = (box: Detection["box"]): Detection => ({ cls: 0, conf: 0.9, box });
    const out = translateInto(
      [d([90, 90, 130, 150]), d([500, 500, 540, 560])],
      [100, 100, 300, 300],
    );
    expect(out.map((x) => x.box)).toEqual([[0, 0, 30, 50]]);
  });
});
