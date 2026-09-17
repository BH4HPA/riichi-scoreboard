import { describe, expect, it } from "vitest";
import {
  BAND_MAX,
  BAND_MIN,
  bandRect,
  boxStyle,
  clampBand,
  clampCenter,
  fitLongEdge,
  fitBox,
  type Viewport,
} from "./band";

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

describe("boxStyle", () => {
  const crop = { x: 0, y: 0, width: 500, height: 200 };

  it("按裁剪区域换算成百分比", () => {
    expect(boxStyle([50, 20, 150, 120], crop)).toEqual({
      left: "10%",
      top: "10%",
      width: "20%",
      height: "50%",
    });
  });

  it("贴边的框落在 0% / 100%", () => {
    expect(boxStyle([0, 0, 500, 200], crop)).toEqual({
      left: "0%",
      top: "0%",
      width: "100%",
      height: "100%",
    });
  });

  it("裁剪尺寸退化时不给出无穷大的样式", () => {
    expect(boxStyle([0, 0, 1, 1], { x: 0, y: 0, width: 0, height: 200 })).toBeNull();
  });
});

describe("相册照片：完整显示、取景带可上下移动", () => {
  // 细长的竖拍截图 720×1920 放进 390×780 的区域：contain 按高度缩放，左右留黑边
  const photo: Viewport = {
    videoWidth: 720,
    videoHeight: 1920,
    displayWidth: 390,
    displayHeight: 780,
    fit: "contain",
  };

  it("contain 的摆放：整张照片都在区域里", () => {
    const box = fitBox(photo)!;
    expect(box.scale).toBeCloseTo(780 / 1920);
    expect(box.top).toBeCloseTo(0);
    expect(box.left).toBeGreaterThan(0);
  });

  it("横向覆盖整张照片宽度；中线下移，裁剪区跟着下移", () => {
    const mid = bandRect(photo, 0.3)!;
    expect(mid.x).toBe(0);
    expect(Math.round(mid.width)).toBe(720);
    const lower = bandRect(photo, 0.3, 0.8)!;
    expect(lower.y).toBeGreaterThan(mid.y);
    expect(Math.round(lower.height)).toBe(Math.round(mid.height));
    // 中线 0.8、带高 0.3：下沿 0.95，仍在照片内
    expect(lower.y + lower.height).toBeLessThanOrEqual(1920 + 1e-6);
  });

  it("中线夹在带不出界的范围内", () => {
    expect(clampCenter(0.05, 0.3)).toBeCloseTo(0.15);
    expect(clampCenter(0.99, 0.3)).toBeCloseTo(0.85);
    expect(clampCenter(0.5, 0.3)).toBe(0.5);
  });

  it("横拍照片放进竖屏：带超出照片的上下黑边部分不算进裁剪", () => {
    const wide: Viewport = { ...photo, videoWidth: 1920, videoHeight: 1080 };
    const r = bandRect(wide, 0.7)!;
    expect(r.y).toBe(0);
    expect(Math.round(r.height)).toBe(1080);
  });
});

describe("fitLongEdge", () => {
  it("相册原图裁出的长条按长边缩到上限，比例不变；小图不放大", () => {
    expect(fitLongEdge(4032, 1300, 1920)).toEqual({ width: 1920, height: 619 });
    expect(fitLongEdge(800, 300, 1920)).toEqual({ width: 800, height: 300 });
  });
});

describe("底栏浮在画面上：取景带只在可见部分里", () => {
  it("带按可见高度居中，映射回画面时整体上移", () => {
    const full = bandRect(portrait, 0.5)!;
    const visible = bandRect(portrait, 0.5, 0.5, 580)!;
    expect(visible.y + visible.height / 2).toBeLessThan(full.y + full.height / 2);
    // 带高 = 可见高度的一半 = 290 px，换回视频像素
    expect(Math.round(visible.height)).toBe(Math.round(290 / (780 / 1080)));
  });
});
