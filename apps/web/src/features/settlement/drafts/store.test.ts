import { beforeEach, describe, expect, it } from "vitest";
import { clearRoomDrafts, draftKey, ensureDraft, updateDraft, useDraftStore } from "./store";

const entry = (key: string) => useDraftStore.getState().entries[key];
const init = () => ({ n: 0 });

describe("结算草稿 store", () => {
  beforeEach(() => useDraftStore.setState({ entries: {} }));

  it("按房间码隔离：两桌同为第一场东一局也互不共享", () => {
    const a = draftKey("AAAAAA", "tsumo");
    const b = draftKey("BBBBBB", "tsumo");
    ensureDraft(a, "1:0:0:playing:0:0");
    ensureDraft(b, "1:0:0:playing:0:0");
    updateDraft(a, 1, init, (s) => ({ n: s.n + 1 }));
    expect(entry(a)?.state).toEqual({ n: 1 });
    expect(entry(b)?.state).toBeNull();
  });

  it("局面一致时沿用草稿；局面变了换新一代，旧代次的回写被丢弃", () => {
    const k = draftKey("R", "ron");
    ensureDraft(k, "s1");
    updateDraft(k, 1, init, () => ({ n: 5 }));
    ensureDraft(k, "s1");
    expect(entry(k)).toEqual({ stamp: "s1", generation: 1, state: { n: 5 } });
    ensureDraft(k, "s2");
    expect(entry(k)).toEqual({ stamp: "s2", generation: 2, state: null });
    // 旧代次的异步回写（算番、照片留存）写不进新草稿
    updateDraft(k, 1, init, () => ({ n: 9 }));
    expect(entry(k)?.state).toBeNull();
    updateDraft(k, 2, init, (s) => ({ n: s.n + 2 }));
    expect(entry(k)?.state).toEqual({ n: 2 });
  });

  it("离开房间只清这个房间的草稿", () => {
    ensureDraft(draftKey("R1", "tsumo"), "s");
    ensureDraft(draftKey("R2", "tsumo"), "s");
    clearRoomDrafts("R1");
    expect(Object.keys(useDraftStore.getState().entries)).toEqual(["R2:tsumo"]);
  });
});
