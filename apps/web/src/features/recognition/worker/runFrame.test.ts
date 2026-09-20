import { describe, expect, it } from "vitest";
import { LOST, RECOGNITION_CLASSES, type Box, type Detection } from "@riichi/core";
import { runFrame } from "./runFrame";

const FRAME = { width: 1080, height: 1920 };
const NAMES = ["1m", "2m", "3m", "4p", "0p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p"];

/** 画面里的一手牌：13 张正放 + 横放的和张，左上角在 (x, y)，牌宽 w */
function handAt(x: number, y: number, w: number): Detection[] {
  const h = w * 1.4;
  const dets = NAMES.map((n, i) => ({
    cls: RECOGNITION_CLASSES.indexOf(n),
    conf: 0.95,
    box: [x + i * w, y, x + (i + 1) * w - 2, y + h] as Detection["box"],
  }));
  const wx = x + NAMES.length * w;
  dets.push({
    cls: RECOGNITION_CLASSES.indexOf("9m"),
    conf: 0.95,
    box: [wx, y + h - w, wx + h, y + h],
  });
  return dets;
}

/** 假推理：只「看见」落在这一块里的牌，记下每次识别的是哪一块 */
function scene(dets: Detection[]) {
  const crops: Box[] = [];
  const detect = (crop: Box) => {
    crops.push(crop);
    const inside = (d: Detection) =>
      d.box[0] >= crop[0] && d.box[1] >= crop[1] && d.box[2] <= crop[2] && d.box[3] <= crop[3];
    return Promise.resolve(dets.filter(inside));
  };
  return { crops, detect };
}

describe("runFrame", () => {
  it("竖屏整帧：第一遍找到手牌，收紧后还能放大，当场再识别一遍；结果出自第二遍那一块", async () => {
    const { crops, detect } = scene(handAt(60, 1200, 64));
    const out = await runFrame(detect, FRAME, LOST, true);
    expect(out.passes).toBe(2);
    expect(crops[0]).toEqual([0, 0, 1080, 1920]);
    expect(out.crop).toEqual(crops[1]);
    expect(out.crop[3] - out.crop[1]).toBeLessThan(1920 / 1.2);
    expect(out.settled).toBe(true);
    expect(out.layout.hand.closed).toHaveLength(14);
    expect(out.track.roi).toEqual(out.crop);
  });

  it("锁定以后稳态一遍：沿用上一帧的范围，不再从整帧找起", async () => {
    const { crops, detect } = scene(handAt(60, 1200, 64));
    const first = await runFrame(detect, FRAME, LOST, true);
    crops.length = 0;
    const next = await runFrame(detect, FRAME, first.track, true);
    expect(next.passes).toBe(1);
    expect(crops).toEqual([first.track.roi]);
    expect(next.settled).toBe(true);
    expect(next.track.roi).toBe(first.track.roi);
  });

  it("横屏近拍：手牌铺满整帧，收紧放大不了多少，一遍即 settled", async () => {
    const wide = { width: 1920, height: 1080 };
    const { detect } = scene(handAt(40, 600, 120));
    const out = await runFrame(detect, wide, LOST, true);
    expect(out.passes).toBe(1);
    expect(out.settled).toBe(true);
  });

  it("手牌移出了锁定的范围：连续两帧认不出就回整帧，第三帧重新找到", async () => {
    const a = scene(handAt(60, 1200, 64));
    const locked = (await runFrame(a.detect, FRAME, LOST, true)).track;
    const b = scene(handAt(60, 300, 64)); // 镜头一抬，手牌跑到画面上部
    const miss1 = await runFrame(b.detect, FRAME, locked, true);
    expect(miss1.settled).toBe(false);
    expect(miss1.track.roi).toEqual(locked.roi);
    const miss2 = await runFrame(b.detect, FRAME, miss1.track, true);
    expect(miss2.track).toEqual(LOST);
    const found = await runFrame(b.detect, FRAME, miss2.track, true);
    expect(found.layout.hand.closed).toHaveLength(14);
    expect(found.settled).toBe(true);
  });

  it("画面里没有牌：一遍、不 settled、不锁定", async () => {
    const out = await runFrame(scene([]).detect, FRAME, LOST, true);
    expect(out).toMatchObject({ passes: 1, settled: false, track: { roi: null } });
  });
});
