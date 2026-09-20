import { describe, expect, it } from "vitest";
import { boxOnScreen, fitBox, fitLongEdge, viewportOf, type Viewport } from "./viewport";

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
    const at = boxOnScreen([540, 960, 640, 1100], 0, portrait)!;
    const s = 780 / 1920;
    expect(at.left).toBeCloseTo(195); // 画面中线落在屏幕中线
    expect(at.top).toBeCloseTo(390);
    expect(at.width).toBeCloseTo(100 * s);
    expect(at.height).toBeCloseTo(140 * s);
  });

  it("被裁到屏幕外的部分给出负值，不夹", () => {
    expect(boxOnScreen([0, 0, 50, 50], 0, portrait)!.left).toBeLessThan(0);
  });

  it("逆时针横持：正立帧左上角的一块落在屏幕右上（机顶朝左，屏幕右上就是观察者的左上）", () => {
    const at = boxOnScreen([0, 0, 192, 108], 90, portrait)!;
    const s = 780 / 1920;
    // 正立帧 1920×1080 的左上 192×108 → 原始帧 x ∈ [972, 1080]、y ∈ [0, 192]：屏幕右上
    expect(at.width).toBeCloseTo(108 * s);
    expect(at.height).toBeCloseTo(192 * s);
    expect(at.top).toBeCloseTo(0);
    expect(at.left + at.width).toBeCloseTo((390 + 1080 * s) / 2);
  });

  it("尺寸退化时返回 null", () => {
    expect(boxOnScreen([0, 0, 1, 1], 0, { ...portrait, displayWidth: 0 })).toBeNull();
  });
});

describe("viewportOf", () => {
  const screen = { clientWidth: 390, clientHeight: 780 };

  it("横持：结果里的帧尺寸是转正后的，要换回没转正的视频尺寸再算摆放", () => {
    const view = viewportOf({ frame: { width: 1920, height: 1080 }, rotation: 90 }, screen);
    expect(view).toEqual(portrait);
    // 转正帧正中的一张牌，画回屏幕仍在正中、大小按竖向视频的缩放
    const at = boxOnScreen([910, 470, 1010, 610], 90, view)!;
    const s = 780 / 1920;
    expect(at.left + at.width / 2).toBeCloseTo(195);
    expect(at.top + at.height / 2).toBeCloseTo(390);
    expect(at.width).toBeCloseTo(140 * s);
    expect(at.height).toBeCloseTo(100 * s);
  });

  it("竖持原样", () => {
    expect(viewportOf({ frame: { width: 1080, height: 1920 }, rotation: 0 }, screen)).toEqual(
      portrait,
    );
  });
});

describe("fitLongEdge", () => {
  it("相册原图按长边缩到上限，比例不变；小图不放大", () => {
    expect(fitLongEdge(4032, 3024, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitLongEdge(800, 300, 1920)).toEqual({ width: 800, height: 300 });
  });
});
