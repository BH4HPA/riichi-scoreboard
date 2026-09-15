import { findTrack, type MusicState } from "@riichi/core";

/** 播放中的文案：「小明立直 · 激斗」；按下者没有座位（主控台代按）时只显「立直 · 激斗」。 */
export function musicLabel(music: MusicState, names: readonly string[]): string {
  const title = findTrack(music.track)?.title ?? music.track;
  const who = music.seat === null ? "" : (names[music.seat] ?? "");
  return `${who}立直 · ${title}`;
}
