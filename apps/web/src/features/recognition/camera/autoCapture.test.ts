import { describe, expect, it } from "vitest";
import type { RecognitionWarning, RecognizedHand } from "@riichi/core";
import {
  EMPTY_CAPTURE,
  feedFrame,
  handKey,
  reasonOf,
  REASON_FRAMES,
  votesOf,
  type CaptureState,
} from "./autoCapture";

const hand = (over: Partial<RecognizedHand> = {}): RecognizedHand => ({
  closed: [1, 2, 3, 13, 14, 15, 25, 26, 27, 7, 8, 11, 11, 9],
  melds: [],
  winTile: 9,
  doraIndicators: [],
  uraIndicators: [],
  ...over,
});

type Frame = Parameters<typeof feedFrame>[1];
const frame = (h: RecognizedHand, warnings: RecognitionWarning[] = [], settled = true): Frame => ({
  hand: h,
  warnings,
  settled,
});
const A = frame(hand());
const B = frame(hand({ winTile: 1 }));
const BAD = frame(hand(), [{ code: "count", message: "合计 17 张", severity: "blocking" }]);
const COARSE = frame(hand(), [], false);

function run(frames: Frame[]): { fires: boolean[]; state: CaptureState } {
  let state: CaptureState = EMPTY_CAPTURE;
  const fires = frames.map((f) => {
    const out = feedFrame(state, f);
    state = out.state;
    return out.fire;
  });
  return { fires, state };
}

describe("handKey", () => {
  it("指示牌不参与指纹：它离手牌最远最容易闪，对「认全了没有」也最不重要", () => {
    expect(handKey(hand({ doraIndicators: [5] }))).toBe(handKey(hand({ doraIndicators: [6, 7] })));
  });

  it("暗牌、和张、副露任意一处不同就是不同的指纹", () => {
    expect(handKey(hand())).not.toBe(handKey(hand({ winTile: 1 })));
    expect(handKey(hand())).not.toBe(handKey(hand({ closed: [1, 2, 3] })));
    expect(handKey(hand())).not.toBe(handKey(hand({ melds: [{ open: true, tiles: [1, 2, 3] }] })));
  });

  it("副露组的先后顺序不影响指纹：镜头一晃组序变了不该重新计数", () => {
    const a = hand({
      melds: [
        { open: true, tiles: [1, 2, 3] },
        { open: false, tiles: [5, 5, 5, 5] },
      ],
    });
    const b = hand({
      melds: [
        { open: false, tiles: [5, 5, 5, 5] },
        { open: true, tiles: [1, 2, 3] },
      ],
    });
    expect(handKey(a)).toBe(handKey(b));
  });
});

describe("feedFrame", () => {
  it("一路一致：第三帧定格", () => {
    expect(run([A, A, A, A]).fires).toEqual([false, false, true, true]);
  });

  it("中间抖一帧不清零：最近 5 帧里凑够 3 帧、且最新两帧一致就定格", () => {
    expect(run([A, B, A, A]).fires).toEqual([false, false, false, true]);
    expect(run([A, BAD, A, A]).fires).toEqual([false, false, false, true]);
  });

  it("A B A B A：A 攒够了 3 票，但牌面一半时间在跳，不定格", () => {
    const { fires, state } = run([A, B, A, B, A]);
    expect(fires).toEqual([false, false, false, false, false]);
    expect(votesOf(state)).toBe(3);
  });

  it("太久以前的票滑出窗口", () => {
    expect(run([A, A, B, B, BAD, A]).fires.at(-1)).toBe(false);
  });

  it("有 blocking、或还没收紧到手牌周围的那一遍：这一帧不计票，也不触发", () => {
    expect(run([A, A, BAD]).fires).toEqual([false, false, false]);
    expect(run([A, A, COARSE]).fires).toEqual([false, false, false]);
    expect(votesOf(run([A, A, COARSE]).state)).toBe(0);
  });

  it("info 提示不挡定格（结果已经自洽，模型只是在汇报内务）", () => {
    const info = frame(hand(), [{ code: "odd_box", message: "x", severity: "info" }]);
    expect(run([info, info, info]).fires).toEqual([false, false, true]);
  });
});

describe("指示牌", () => {
  const withDora = frame(hand({ doraIndicators: [5] }));

  it("同一副牌的前几帧认出过指示牌：不在没认出来的这一帧定格，等它回来", () => {
    expect(run([withDora, A, A]).fires).toEqual([false, false, false]);
    expect(run([withDora, A, A, withDora, withDora]).fires.at(-1)).toBe(true);
  });

  it("窗口里始终没见过指示牌，照常定格；见过的那一帧滑出窗口以后也不再等", () => {
    expect(run([A, A, A]).fires.at(-1)).toBe(true);
    expect(run([withDora, A, A, A, A, A]).fires.at(-1)).toBe(true);
  });
});

describe("reasonOf", () => {
  it("同一条 blocking 连着挡了几帧才告诉用户；一帧好的就收回", () => {
    const few = run(Array.from({ length: REASON_FRAMES - 1 }, () => BAD)).state;
    expect(reasonOf(few)).toBeNull();
    const stuck = run(Array.from({ length: REASON_FRAMES }, () => BAD)).state;
    expect(reasonOf(stuck)).toBe("合计 17 张");
    expect(reasonOf(feedFrame(stuck, A).state)).toBeNull();
  });

  it("粗检那一遍夹在中间不打断计数：它的提示不作数", () => {
    const state = run([BAD, BAD, COARSE, BAD]).state;
    expect(reasonOf(state)).toBe("合计 17 张");
  });
});
