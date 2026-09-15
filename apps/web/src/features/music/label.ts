import { findTrack, type MusicState } from "@riichi/core";

/** 播放中的文案：「小明立直 · 激斗」；按下者没有名字时只显「立直 · 激斗」。 */
export function musicLabel(music: MusicState): string {
  const title = findTrack(music.track)?.title ?? music.track;
  return `${music.name ? `${music.name}立直` : "立直"} · ${title}`;
}
