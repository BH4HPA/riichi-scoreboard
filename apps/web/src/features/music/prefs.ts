import type { MusicTrack } from "@riichi/core";
import { readLocalJson, writeLocal } from "@/lib/localStore";

/** 手机本地的立直音乐偏好：上次选的曲目、各曲目被按下「立直」的次数。 */
export interface MusicPrefs {
  last: string | null;
  counts: Record<string, number>;
}

export const EMPTY_PREFS: MusicPrefs = { last: null, counts: {} };

const KEY = "riichi.music.prefs";

function parsePrefs(raw: unknown): MusicPrefs {
  const v = raw as Partial<MusicPrefs> | null;
  if (typeof v !== "object" || v === null) return EMPTY_PREFS;
  const counts: Record<string, number> = {};
  const rawCounts = typeof v.counts === "object" && v.counts !== null ? v.counts : {};
  for (const [id, n] of Object.entries(rawCounts)) {
    if (typeof n === "number" && Number.isInteger(n) && n > 0) counts[id] = n;
  }
  return { last: typeof v.last === "string" ? v.last : null, counts };
}

export const readPrefs = (): MusicPrefs => readLocalJson(KEY, parsePrefs) ?? EMPTY_PREFS;

export const writePrefs = (prefs: MusicPrefs) => writeLocal(KEY, JSON.stringify(prefs));

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
