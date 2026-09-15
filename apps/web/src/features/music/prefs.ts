import type { MusicTrack } from "@riichi/core";

/** 手机本地的立直音乐偏好：上次选的曲目、各曲目被按下「立直」的次数。 */
export interface MusicPrefs {
  last: string | null;
  counts: Record<string, number>;
}

export const EMPTY_PREFS: MusicPrefs = { last: null, counts: {} };

const KEY = "riichi.music.prefs";

export function readPrefs(): MusicPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_PREFS;
    const v = JSON.parse(raw) as Partial<MusicPrefs>;
    const counts: Record<string, number> = {};
    for (const [id, n] of Object.entries(v.counts ?? {})) {
      if (typeof n === "number" && Number.isInteger(n) && n > 0) counts[id] = n;
    }
    return { last: typeof v.last === "string" ? v.last : null, counts };
  } catch {
    return EMPTY_PREFS;
  }
}

export function writePrefs(prefs: MusicPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* 私密模式等场景忽略 */
  }
}

/** 按被选用次数降序；次数相同保持曲库顺序。 */
export function orderTracks(tracks: readonly MusicTrack[], prefs: MusicPrefs): MusicTrack[] {
  const count = (t: MusicTrack) => prefs.counts[t.id] ?? 0;
  return [...tracks].sort((a, b) => count(b) - count(a));
}

/** 默认选中：上次选的（仍在曲库里）；否则排序后的第一首。 */
export function defaultTrack(ordered: readonly MusicTrack[], prefs: MusicPrefs): string | null {
  if (prefs.last && ordered.some((t) => t.id === prefs.last)) return prefs.last;
  return ordered[0]?.id ?? null;
}

export function withLast(prefs: MusicPrefs, id: string): MusicPrefs {
  return { ...prefs, last: id };
}

/** 按下「立直」：记为上次选择并计数 +1。 */
export function withPick(prefs: MusicPrefs, id: string): MusicPrefs {
  return { last: id, counts: { ...prefs.counts, [id]: (prefs.counts[id] ?? 0) + 1 } };
}
