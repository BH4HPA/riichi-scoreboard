import { describe, expect, it } from "vitest";
import { sourceBox, uprightAngle, uprightSize, type Rotation } from "./upright";

const SRC = { width: 1080, height: 1920 };

/** 按 uprightAngle 真的转一遍：原始帧里的点 → 正立帧里的点（绕原点转，再平移回第一象限） */
function rotatePoint(x: number, y: number, rotation: Rotation): [number, number] {
  const a = uprightAngle(rotation);
  const [rx, ry] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  if (rotation === 90) return [rx, ry + SRC.width];
  if (rotation === 270) return [rx + SRC.height, ry];
  return [rx, ry];
}

describe("upright", () => {
  it("横持时正立帧宽高互换", () => {
    expect(uprightSize(SRC, 0)).toEqual(SRC);
    expect(uprightSize(SRC, 90)).toEqual({ width: 1920, height: 1080 });
    expect(uprightSize(SRC, 270)).toEqual({ width: 1920, height: 1080 });
  });

  it("逆时针横持（机顶朝左）：观察者的「上」是原始帧的右边", () => {
    // 原始帧右边缘中点 → 正立帧上边缘中点
    const [u, v] = rotatePoint(SRC.width, SRC.height / 2, 90);
    expect([Math.round(u), Math.round(v)]).toEqual([960, 0]);
  });

  it("顺时针横持（机顶朝右）：观察者的「上」是原始帧的左边", () => {
    const [u, v] = rotatePoint(0, SRC.height / 2, 270);
    expect([Math.round(u), Math.round(v)]).toEqual([960, 0]);
  });

  it.each([90, 270] as const)("sourceBox 与画布旋转互逆（%i）", (rotation) => {
    const box = [100, 200, 700, 500] as const;
    const [x1, y1, x2, y2] = sourceBox(box, rotation, SRC);
    expect(x2 - x1).toBe(300); // 正立帧里的高 = 原始帧里的宽
    expect(y2 - y1).toBe(600);
    // 原始帧那一块的四角转正以后，外接矩形就是 box
    const pts = [
      rotatePoint(x1, y1, rotation),
      rotatePoint(x2, y1, rotation),
      rotatePoint(x1, y2, rotation),
      rotatePoint(x2, y2, rotation),
    ];
    const us = pts.map((p) => Math.round(p[0]));
    const vs = pts.map((p) => Math.round(p[1]));
    expect([Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)]).toEqual([...box]);
  });

  it("竖持原样返回", () => {
    const box = [1, 2, 3, 4] as const;
    expect(sourceBox(box, 0, SRC)).toBe(box);
  });
});
