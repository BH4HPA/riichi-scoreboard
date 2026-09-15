import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { findTrack, MUSIC_TRACKS } from "./index";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("music manifest", () => {
  it("id 全是小写 uuid v4，id 与 title 不重复，file 带 .mp3", () => {
    expect(manifest.length).toBeGreaterThan(0);
    for (const t of manifest) {
      expect(t.id).toMatch(UUID);
      expect(t.title.trim()).toBe(t.title);
      expect(t.title).not.toBe("");
      expect(t.file).toMatch(/\.mp3$/);
    }
    expect(new Set(manifest.map((t) => t.id)).size).toBe(manifest.length);
    expect(new Set(manifest.map((t) => t.title)).size).toBe(manifest.length);
  });

  it("运行时曲库只带 id/title；findTrack", () => {
    const first = MUSIC_TRACKS[0]!;
    expect(first).toEqual({ id: manifest[0]!.id, title: manifest[0]!.title });
    expect(findTrack(first.id)).toEqual(first);
    expect(findTrack("nope")).toBeNull();
  });
});
