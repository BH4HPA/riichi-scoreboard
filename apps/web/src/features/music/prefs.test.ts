import { describe, expect, it } from "vitest";
import type { MusicTrack } from "@riichi/core";
import { defaultTrack, EMPTY_PREFS, orderTracks, withLast, withPick } from "./prefs";

const tracks: MusicTrack[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  title: id.toUpperCase(),
  file: `${id}.mp3`,
}));

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
});
