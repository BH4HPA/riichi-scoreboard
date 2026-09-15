/** 曲库对象所在的公网地址；对象名 = manifest 里的 uuid（上传见 ci/upload-music.sh，两处前缀须一致）。 */
const MUSIC_BASE_URL = "https://static.bitego.net/riichi/music";

export function musicUrl(id: string): string {
  return `${MUSIC_BASE_URL}/${id}.mp3`;
}
