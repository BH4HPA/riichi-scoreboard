import { describe, expect, it } from "vitest";
import { boxOnScreen, fitBox, fitLongEdge, type Viewport } from "./viewport";

/** 竖屏手机（390×780）上的竖向视频（1080×1920）：cover 按高度铺满，左右各裁掉一点 */
const portrait: Viewport = {
  videoWidth: 1080,
  videoHeight: 1920,
  displayWidth: 390,
  displayHeight: 780,
};

describe("fitBox", () => {
  it("cover：取较大的缩放比，多出来的一边居中裁掉", () => {
    const fit = fitBox(portrait)!;
    expect(fit.scale).toBeCloseTo(780 / 1920);
    expect(fit.top).toBeCloseTo(0);
    expect(fit.left).toBeCloseTo((390 - 1080 * (780 / 1920)) / 2);
    expect(fit.left).toBeLessThan(0);
  });

  it("尺寸还没就绪时返回 null", () => {
    expect(fitBox({ ...portrait, videoWidth: 0 })).toBeNull();
    expect(fitBox({ ...portrait, displayHeight: 0 })).toBeNull();
  });
});

describe("boxOnScreen", () => {
  it("整帧坐标的框按 cover 的缩放与偏移画回屏幕", () => {
    const at = boxOnScreen([540, 960, 640, 1100], portrait)!;
    const s = 780 / 1920;
    expect(at.left).toBeCloseTo(195); // 画面中线落在屏幕中线
    expect(at.top).toBeCloseTo(390);
    expect(at.width).toBeCloseTo(100 * s);
    expect(at.height).toBeCloseTo(140 * s);
  });

  it("被裁到屏幕外的部分给出负值，不夹", () => {
    expect(boxOnScreen([0, 0, 50, 50], portrait)!.left).toBeLessThan(0);
  });

  it("尺寸退化时返回 null", () => {
    expect(boxOnScreen([0, 0, 1, 1], { ...portrait, displayWidth: 0 })).toBeNull();
  });
});

describe("fitLongEdge", () => {
  it("相册原图按长边缩到上限，比例不变；小图不放大", () => {
    expect(fitLongEdge(4032, 3024, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitLongEdge(800, 300, 1920)).toEqual({ width: 800, height: 300 });
  });
});
