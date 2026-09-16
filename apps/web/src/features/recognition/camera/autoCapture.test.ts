import { describe, expect, it } from "vitest";
import type { RecognitionWarning, RecognizedHand } from "@riichi/core";
import { EMPTY_CAPTURE, feedFrame, handKey, STABLE_FRAMES, type CaptureState } from "./autoCapture";

const hand = (over: Partial<RecognizedHand> = {}): RecognizedHand => ({
  closed: [1, 2, 3, 13, 14, 15, 25, 26, 27, 7, 8, 11, 11, 9],
  melds: [],
  winTile: 9,
  doraIndicators: [],
  uraIndicators: [],
  ...over,
});

const frame = (h: RecognizedHand, warnings: RecognitionWarning[] = []) => ({ hand: h, warnings });

/** 连喂 n 帧同一副牌，返回每帧的 fire */
function run(frames: Array<ReturnType<typeof frame>>): boolean[] {
  let state: CaptureState = EMPTY_CAPTURE;
  return frames.map((f) => {
    const out = feedFrame(state, f);
    state = out.state;
    return out.fire;
  });
}

describe("handKey", () => {
  it("指示牌不参与指纹：它在取景带最远端最容易闪，对「认全了没有」也最不重要", () => {
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
  it("连续三帧一致才触发", () => {
    expect(run(Array.from({ length: 4 }, () => frame(hand())))).toEqual([false, false, true, true]);
    expect(STABLE_FRAMES).toBe(3);
  });

  it("中间抖一帧就重来，且重置为 1 不是 0（当前这帧算新的第一帧）", () => {
    const fires = run([frame(hand()), frame(hand({ winTile: 1 })), frame(hand()), frame(hand())]);
    expect(fires).toEqual([false, false, false, false]);
    // 抖动那帧之后重新数：第 3、4 帧是 1、2，要到第 5 帧才够 3
    const state = [frame(hand()), frame(hand({ winTile: 1 }))].reduce(
      (s: CaptureState, f) => feedFrame(s, f).state,
      EMPTY_CAPTURE,
    );
    expect(state.count).toBe(1);
  });

  it("有 blocking 提示时一律不触发，并把计数清空", () => {
    const bad = frame(hand(), [{ code: "count", message: "x", severity: "blocking" }]);
    let state: CaptureState = EMPTY_CAPTURE;
    state = feedFrame(state, frame(hand())).state;
    state = feedFrame(state, frame(hand())).state;
    expect(state.count).toBe(2);
    const out = feedFrame(state, bad);
    expect(out.fire).toBe(false);
    expect(out.state).toEqual(EMPTY_CAPTURE);
  });

  it("info 提示不挡定格（结果已经自洽，模型只是在汇报内务）", () => {
    const info = frame(hand(), [{ code: "odd_box", message: "x", severity: "info" }]);
    expect(run([info, info, info])).toEqual([false, false, true]);
  });
});
