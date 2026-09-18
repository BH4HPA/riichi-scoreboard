import type { MusicState, MusicTrack } from "@riichi/core";

/** 播放中的文案：「小明立直 · 激斗」；按下者没有座位（主控台代按）时只显「立直 · 激斗」。 */
export function musicLabel(
  music: MusicState,
  names: readonly string[],
  tracks: readonly MusicTrack[],
): string {
  const title = tracks.find((t) => t.id === music.track)?.title ?? "立直音乐";
  const who = music.seat === null ? "" : (names[music.seat] ?? "");
  return `${who}立直 · ${title}`;
}
