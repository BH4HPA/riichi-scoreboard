import manifest from "./manifest.json";

/**
 * 立直音乐曲库。对象放在 static 桶 `riichi/music/<id>.mp3`（对象名用 uuid，不用中文文件名）；
 * manifest 是唯一真相源：id 进协议与本地偏好，title 只做展示，file 供 `ci/upload-music.sh` 找源文件。
 */
export interface MusicTrack {
  id: string;
  title: string;
  file: string;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = manifest;

export const MUSIC_BASE_URL = "https://static.bitego.net/riichi/music";

export function musicUrl(id: string): string {
  return `${MUSIC_BASE_URL}/${id}.mp3`;
}

export function findTrack(id: string): MusicTrack | null {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? null;
}
