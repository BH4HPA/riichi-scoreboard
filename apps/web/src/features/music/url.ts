import { STATIC_BASE_URL } from "@/lib/staticUrl";

/** 曲库对象地址；对象名 = manifest 里的 uuid（上传见 ci/upload-music.sh）。 */
export function musicUrl(id: string): string {
  return `${STATIC_BASE_URL}/music/${id}.mp3`;
}
