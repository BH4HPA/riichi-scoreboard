import { describe, expect, it } from "vitest";
import { BAND_MAX, BAND_MIN, bandRect, clampBand, type Viewport } from "./band";

/** 横向视频（1920×1080）放进竖屏手机（390×780）：object-cover 会把左右各裁掉一大块 */
const portrait: Viewport = {
  videoWidth: 1920,
  videoHeight: 1080,
  displayWidth: 390,
  displayHeight: 780,
};

describe("clampBand", () => {
  it("夹在 25%–70%", () => {
    expect(clampBand(0.1)).toBe(BAND_MIN);
    expect(clampBand(0.9)).toBe(BAND_MAX);
    expect(clampBand(0.45)).toBe(0.45);
  });
});

describe("bandRect", () => {
  it("object-cover 下取景带映射回视频像素：纵向居中，横向就是被裁剩的可见范围", () => {
    const r = bandRect(portrait, 0.5)!;
    // scale = max(390/1920, 780/1080) = 0.7222；可见宽 = 390/0.7222 = 540 px
    expect(Math.round(r.width)).toBe(540);
    expect(Math.round(r.height)).toBe(Math.round((780 * 0.5) / (780 / 1080)));
    // 纵向居中；横向也居中（左右被裁掉的量相等）
    expect(Math.round(r.y + r.height / 2)).toBe(1080 / 2);
    expect(Math.round(r.x + r.width / 2)).toBe(1920 / 2);
    expect(Math.round(r.x)).toBe(690);
  });

  it("带越高裁得越多，且永远不超出画面", () => {
    const small = bandRect(portrait, BAND_MIN)!;
    const big = bandRect(portrait, BAND_MAX)!;
    expect(big.height).toBeGreaterThan(small.height);
    for (const r of [small, big]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(portrait.videoWidth + 1e-6);
      expect(r.y + r.height).toBeLessThanOrEqual(portrait.videoHeight + 1e-6);
    }
  });

  it("横屏元素比视频更宽时按宽度铺满，上下裁掉", () => {
    const wide: Viewport = {
      videoWidth: 1280,
      videoHeight: 960,
      displayWidth: 800,
      displayHeight: 400,
    };
    const r = bandRect(wide, 1)!;
    expect(Math.round(r.width)).toBe(1280);
    // 元素比例 2:1 比视频的 4:3 更扁，上下各裁掉一块
    expect(r.height).toBeLessThan(wide.videoHeight);
    expect(r.y).toBeGreaterThan(0);
  });

  it("尺寸还没就绪时返回 null，不给出退化矩形", () => {
    expect(bandRect({ ...portrait, videoWidth: 0 }, 0.45)).toBeNull();
    expect(bandRect({ ...portrait, displayHeight: 0 }, 0.45)).toBeNull();
  });
});
