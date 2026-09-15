import { describe, expect, it } from "vitest";
import { decodeNmsOutput, letterboxGeometry, unletterbox } from "./letterbox";

describe("letterbox", () => {
  it("横图：缩放到宽 640，上下补边", () => {
    const g = letterboxGeometry(1280, 960);
    expect(g.scale).toBe(0.5);
    expect(g.padX).toBe(0);
    expect(g.padY).toBe(80);
    expect(unletterbox([0, 80, 640, 560], g)).toEqual([0, 0, 1280, 960]);
  });

  it("竖图：左右补边；坐标裁到图内", () => {
    const g = letterboxGeometry(960, 1280);
    expect(g.padX).toBe(80);
    expect(g.padY).toBe(0);
    expect(unletterbox([70, -10, 700, 700], g)).toEqual([0, 0, 960, 1280]);
  });

  it("往返：原图框 → letterbox → 原图", () => {
    const g = letterboxGeometry(1000, 750);
    const box: [number, number, number, number] = [100, 200, 300, 400];
    const lb = box.map((v, i) => v * g.scale + (i % 2 === 0 ? g.padX : g.padY)) as typeof box;
    const back = unletterbox(lb, g);
    back.forEach((v, i) => expect(v).toBeCloseTo(box[i]!, 6));
  });

  it("decodeNmsOutput：遇零填充停止，类 id 取整并过滤越界，退化框丢弃", () => {
    const g = letterboxGeometry(640, 640);
    const rows = [
      [10, 10, 50, 70, 0.9, 3.2],
      [60, 10, 100, 70, 0.8, 40], // 越界
      [110, 10, 110, 70, 0.7, 5], // 宽 0
      [120, 10, 160, 70, 0.6, 36.6], // 取整 → 37
      [0, 0, 0, 0, 0, 0], // 零填充
      [200, 10, 240, 70, 0.5, 1],
    ].flat();
    const dets = decodeNmsOutput(rows, g, 38);
    expect(dets.map((d) => d.cls)).toEqual([3, 37]);
    expect(dets[0]!.box).toEqual([10, 10, 50, 70]);
  });
});
