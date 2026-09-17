import { describe, expect, it } from "vitest";
import { TILE, type RecognitionWarning } from "@riichi/core";
import type { DraftRecognition } from "@/features/recognition/applyRecognized";
import {
  closedCapacity,
  confirmable,
  createValueDraft,
  draftToClientValue,
  draftValue,
  isHandComplete,
  missingValue,
  withHandEdit,
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

describe("withHandEdit 里宝暂存", () => {
  const base = createValueDraft(false, "hand");
  const riichi: ValueDraft = {
    ...base,
    hand: {
      ...base.hand,
      riichi: true,
      doraIndicators: [TILE.M1, TILE.M2],
      uraIndicators: [TILE.P3, TILE.P4],
    },
  };
  const off = (d: ValueDraft) => withHandEdit(d, { ...d.hand, riichi: false, uraIndicators: [] });
  const on = (d: ValueDraft) => withHandEdit(d, { ...d.hand, riichi: true });

  it("取消立直暂存里宝，重新勾上还原并清空暂存", () => {
    const cleared = off(riichi);
    expect(cleared.hand.uraIndicators).toEqual([]);
    expect(cleared.uraStash).toEqual([TILE.P3, TILE.P4]);
    const restored = on(cleared);
    expect(restored.hand.uraIndicators).toEqual([TILE.P3, TILE.P4]);
    expect(restored.uraStash).toEqual([]);
  });

  it("还原张数不超过当前宝牌指示牌", () => {
    const cleared = off(riichi);
    const fewerDora = withHandEdit(cleared, { ...cleared.hand, doraIndicators: [TILE.M1] });
    expect(on(fewerDora).hand.uraIndicators).toEqual([TILE.P3]);
  });

  it("其它编辑不碰暂存", () => {
    const cleared = off(riichi);
    const edited = withHandEdit(cleared, { ...cleared.hand, lastTile: true });
    expect(edited.uraStash).toEqual([TILE.P3, TILE.P4]);
    expect(edited.hand.lastTile).toBe(true);
  });
});

describe("手填番符：不给默认值", () => {
  const manual = (over: Partial<ValueDraft>) => ({ ...createValueDraft(true, "manual"), ...over });

  it("番、符都选了才有值；缺项逐个列出", () => {
    expect(draftValue(manual({}))).toBeNull();
    expect(missingValue(manual({}))).toEqual(["番", "符"]);
    expect(draftValue(manual({ han: 3 }))).toBeNull();
    expect(missingValue(manual({ han: 3 }))).toEqual(["符"]);
    expect(draftValue(manual({ han: 3, fu: 30 }))).toEqual({ han: 3, fu: 30, yakuman: 0 });
    expect(missingValue(manual({ han: 3, fu: 30 }))).toEqual([]);
  });

  it("役满不看番符", () => {
    const d = manual({ yakuman: 1 });
    expect(draftValue(d)).toEqual({ han: 0, fu: 0, yakuman: 1 });
    expect(missingValue(d)).toEqual([]);
    expect(draftToClientValue(d)).toEqual({ kind: "manual", han: 0, fu: 0, yakuman: 1 });
  });

  it("牌面模式未评估时缺「牌面」", () => {
    expect(missingValue(createValueDraft(true, "hand"))).toEqual(["牌面"]);
  });
});
