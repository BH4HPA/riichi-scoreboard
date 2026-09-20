import { describe, expect, it } from "vitest";
import { rotationFromTilt } from "./tilt";

describe("rotationFromTilt", () => {
  it("竖着拿 / 逆时针横持（左边朝下，γ<0）/ 顺时针横持", () => {
    expect(rotationFromTilt(60, 0, 0, 90)).toBe(0);
    expect(rotationFromTilt(5, -50, 0, 0)).toBe(90);
    expect(rotationFromTilt(5, 50, 0, 0)).toBe(270);
  });

  it("接近水平（对着桌面拍）：倾斜不到 15° 保持上一次的方向", () => {
    expect(rotationFromTilt(3, -10, 0, 0)).toBe(0);
    expect(rotationFromTilt(3, -10, 0, 90)).toBe(90);
    expect(rotationFromTilt(10, 2, 0, 270)).toBe(270);
    // 刚过 15° 就切
    expect(rotationFromTilt(2, -16, 0, 0)).toBe(90);
  });

  it("斜着拿（两个方向都倾斜、差不多大）：保持上一次的，不来回切", () => {
    expect(rotationFromTilt(30, -30, 0, 0)).toBe(0);
    expect(rotationFromTilt(30, -30, 0, 90)).toBe(90);
  });

  it("横持竖起来时 β 在 0 / 180 之间跳，结论不变", () => {
    expect(rotationFromTilt(1, -88, 0, 0)).toBe(90);
    expect(rotationFromTilt(179, 88, 0, 0)).toBe(90);
  });

  it("倒着拿：没有对应的界面方向，保持上一次的", () => {
    expect(rotationFromTilt(-60, 0, 0, 90)).toBe(90);
  });

  it("页面自己跟着转了（旋转锁关着）：界面不用再转", () => {
    expect(rotationFromTilt(5, -50, 90, 90)).toBe(0);
    expect(rotationFromTilt(5, 50, 270, 0)).toBe(0);
    // 页面横着、手机又竖回来，但页面还没跟上：相对页面是另一个方向的横
    expect(rotationFromTilt(60, 0, 90, 0)).toBe(270);
  });
});
