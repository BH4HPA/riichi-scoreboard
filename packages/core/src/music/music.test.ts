import { describe, expect, it } from "vitest";
import { findTrack, MUSIC_TRACKS, musicUrl } from "./index";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("music manifest", () => {
  it("id 全是 uuid v4，id 与 title 不重复，file 带 .mp3", () => {
    expect(MUSIC_TRACKS.length).toBeGreaterThan(0);
    for (const t of MUSIC_TRACKS) {
      expect(t.id).toMatch(UUID);
      expect(t.title.trim()).toBe(t.title);
      expect(t.title).not.toBe("");
      expect(t.file).toMatch(/\.mp3$/);
    }
    expect(new Set(MUSIC_TRACKS.map((t) => t.id)).size).toBe(MUSIC_TRACKS.length);
    expect(new Set(MUSIC_TRACKS.map((t) => t.title)).size).toBe(MUSIC_TRACKS.length);
  });

  it("musicUrl / findTrack", () => {
    const first = MUSIC_TRACKS[0]!;
    expect(musicUrl(first.id)).toBe(`https://static.bitego.net/riichi/music/${first.id}.mp3`);
    expect(findTrack(first.id)).toEqual(first);
    expect(findTrack("nope")).toBeNull();
  });
});
