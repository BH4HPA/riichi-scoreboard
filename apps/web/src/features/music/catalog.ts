import { useEffect, useState } from "react";
import { parseMusicCatalog, type MusicTrack } from "@riichi/core";
import { STATIC_BASE_URL } from "@/lib/staticUrl";

let pending: Promise<MusicTrack[]> | null = null;

/** 曲库清单：按页面生命周期缓存一份；没配静态桶或清单取不到都算「没有曲库」，失败后下次再试。 */
export function loadMusicCatalog(): Promise<MusicTrack[]> {
  if (!STATIC_BASE_URL) return Promise.resolve([]);
  if (pending) return pending;
  const attempt = fetch(`${STATIC_BASE_URL}/music/manifest.json`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then(parseMusicCatalog);
  pending = attempt;
  attempt.catch(() => {
    if (pending === attempt) pending = null;
  });
  return attempt.catch(() => []);
}

/** 清单到手前为空数组：界面按「暂无曲库」渲染，不闪加载态。 */
export function useMusicCatalog(): MusicTrack[] {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  useEffect(() => {
    let active = true;
    void loadMusicCatalog().then((t) => active && setTracks(t));
    return () => {
      active = false;
    };
  }, []);
  return tracks;
}
