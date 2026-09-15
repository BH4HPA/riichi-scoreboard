import { afterEach, describe, expect, it, vi } from "vitest";
import type { MusicTrack } from "@riichi/core";
import { defaultTrack, EMPTY_PREFS, orderTracks, readPrefs, withLast, withPick } from "./prefs";

const tracks: MusicTrack[] = ["a", "b", "c", "d"].map((id) => ({ id, title: id.toUpperCase() }));

describe("music prefs", () => {
  it("次数降序，同次数保持曲库顺序", () => {
    const prefs = { last: null, counts: { c: 2, b: 2, d: 1 } };
    expect(orderTracks(tracks, prefs).map((t) => t.id)).toEqual(["b", "c", "d", "a"]);
    expect(orderTracks(tracks, EMPTY_PREFS).map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("默认选中上次的；上次不在曲库或无记录则取第一首", () => {
    const ordered = orderTracks(tracks, EMPTY_PREFS);
    expect(defaultTrack(ordered, EMPTY_PREFS)).toBe("a");
    expect(defaultTrack(ordered, { last: "c", counts: {} })).toBe("c");
    expect(defaultTrack(ordered, { last: "gone", counts: {} })).toBe("a");
    expect(defaultTrack([], EMPTY_PREFS)).toBeNull();
  });

  it("选中只记 last；按下立直才计数", () => {
    const selected = withLast(EMPTY_PREFS, "b");
    expect(selected).toEqual({ last: "b", counts: {} });
    const pressed = withPick(withPick(selected, "b"), "b");
    expect(pressed).toEqual({ last: "b", counts: { b: 2 } });
    expect(EMPTY_PREFS.counts).toEqual({});
  });

  describe("readPrefs 容错", () => {
    afterEach(() => vi.unstubAllGlobals());
    const stub = (raw: string | null, throws = false) =>
      vi.stubGlobal("localStorage", {
        getItem: () => {
          if (throws) throw new Error("blocked");
          return raw;
        },
      });

    it("无 localStorage / 读取抛错 / 空值 → 空偏好", () => {
      expect(readPrefs()).toEqual(EMPTY_PREFS);
      stub(null, true);
      expect(readPrefs()).toEqual(EMPTY_PREFS);
      stub(null);
      expect(readPrefs()).toEqual(EMPTY_PREFS);
    });

    it("畸形内容只保留合法部分", () => {
      stub("null");
      expect(readPrefs()).toEqual(EMPTY_PREFS);
      stub("{not json");
      expect(readPrefs()).toEqual(EMPTY_PREFS);
      stub(JSON.stringify({ last: 3, counts: 5 }));
      expect(readPrefs()).toEqual(EMPTY_PREFS);
      stub(JSON.stringify({ last: "a", counts: { a: 2, b: -1, c: 1.5, d: "9" } }));
      expect(readPrefs()).toEqual({ last: "a", counts: { a: 2 } });
    });
  });
});
