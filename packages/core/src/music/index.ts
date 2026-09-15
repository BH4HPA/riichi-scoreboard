import manifest from "./manifest.json";

/**
 * 立直音乐曲库。对象放在 static 桶 `riichi/music/<id>.mp3`（对象名用 uuid，不用中文文件名）；
 * manifest 是唯一真相源：id 进协议与本地偏好，title 只做展示；manifest 里的 file 只供
 * `ci/upload-music.sh` 找源文件，不进运行时。播放 URL 由 web 拼（features/music/url.ts）。
 */
export interface MusicTrack {
  id: string;
  title: string;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = manifest.map(({ id, title }) => ({ id, title }));

export function findTrack(id: string): MusicTrack | null {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? null;
}
