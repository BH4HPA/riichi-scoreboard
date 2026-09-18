/**
 * 立直音乐曲库。清单与音频都在部署方的静态桶里（`<static>/music/manifest.json`、`<static>/music/<id>.mp3`），
 * 仓库不带曲目：id 进协议与本地偏好，title 只做展示。上传见 ci/upload-music.sh。
 */
export interface MusicTrack {
  id: string;
  title: string;
}

const TRACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TITLE_MAX = 40;

/** 曲目 id 是小写 uuid v4：服务端只校验格式，不持有曲库。 */
export function isTrackId(v: unknown): v is string {
  return typeof v === "string" && TRACK_ID.test(v);
}

/** 解析桶里的清单：形状不对整份拒绝（抛错），调用方按「没有曲库」处理。 */
export function parseMusicCatalog(input: unknown): MusicTrack[] {
  if (!Array.isArray(input)) throw new Error("曲库清单必须是数组");
  const tracks = input.map((t: unknown): MusicTrack => {
    if (typeof t !== "object" || t === null) throw new Error("曲目必须是对象");
    const { id, title } = t as Record<string, unknown>;
    if (!isTrackId(id)) throw new Error(`曲目 id 无效：${String(id)}`);
    if (typeof title !== "string" || title.trim() === "" || title.length > TITLE_MAX) {
      throw new Error(`曲目 ${id} 的标题无效`);
    }
    return { id, title: title.trim() };
  });
  if (new Set(tracks.map((t) => t.id)).size !== tracks.length) throw new Error("曲目 id 重复");
  return tracks;
}
