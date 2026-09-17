import { describe, expect, it } from "vitest";
import { TILE, type RecognitionWarning } from "@riichi/core";
import type { DraftRecognition } from "@/features/recognition/applyRecognized";
import {
  closedCapacity,
  confirmable,
  createValueDraft,
  isHandComplete,
  type ValueDraft,
} from "./valueDraft";

const CLOSED14 = [1, 2, 3, 13, 14, 15, 25, 26, 27, 7, 8, 11, 11, 9];

function rec(warnings: RecognitionWarning[] = []): DraftRecognition {
  return { key: "k", id: null, ms: 10, warnings, uncertain: [] };
}

/** 一手认全了的牌面草稿 */
function recognized(over: Partial<ValueDraft> = {}): ValueDraft {
  return {
    ...createValueDraft(false, "manual"),
    mode: "hand",
    hand: { ...createValueDraft(false, "manual").hand, closed: [...CLOSED14], winTile: TILE.M9 },
    recognition: rec(),
    ...over,
  };
}

describe("closedCapacity / isHandComplete", () => {
  it("每组副露折 3 张；录满且指定和张才算完整", () => {
    const base = createValueDraft(false, "manual").hand;
    expect(closedCapacity(base)).toBe(14);
    expect(closedCapacity({ melds: [{ open: true, tiles: [1, 2, 3] }] })).toBe(11);
    expect(isHandComplete(base)).toBe(false);
    expect(isHandComplete({ ...base, closed: [...CLOSED14], winTile: TILE.M9 })).toBe(true);
    // 录满但没指定和张
    expect(isHandComplete({ ...base, closed: [...CLOSED14], winTile: 0 })).toBe(false);
  });
});

describe("confirmable", () => {
  it("识别来的完整牌面收起键盘", () => {
    expect(confirmable(recognized())).toBe(true);
  });

  it("手工录入的不收（用户正在用键盘，不能在手底下把它拿走）", () => {
    expect(confirmable(recognized({ recognition: null }))).toBe(false);
  });

  it("番符模式不收", () => {
    expect(confirmable(recognized({ mode: "manual" }))).toBe(false);
  });

  it("有 blocking 提示就不收，info 不影响", () => {
    const blocking = rec([{ code: "count", message: "x", severity: "blocking" }]);
    expect(confirmable(recognized({ recognition: blocking }))).toBe(false);
    const info = rec([{ code: "odd_box", message: "x", severity: "info" }]);
    expect(confirmable(recognized({ recognition: info }))).toBe(true);
  });

  it("牌面不完整不收", () => {
    const draft = recognized();
    expect(confirmable({ ...draft, hand: { ...draft.hand, closed: CLOSED14.slice(0, 5) } })).toBe(
      false,
    );
  });

  it("点过「改牌」之后一直留在编辑态", () => {
    expect(confirmable(recognized({ editing: true }))).toBe(false);
  });

  it("一张宝牌指示牌都没有也照收（用户拍板：不算阻塞，靠确认态留空位提醒）", () => {
    const draft = recognized();
    expect(draft.hand.doraIndicators).toEqual([]);
    expect(confirmable(draft)).toBe(true);
  });
});
