import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "@/lib/localStore";

/** 主控台界面大小档位（根字号倍数）：Pad 放在桌边字偏小，按房间远近调大 */
export const CONSOLE_SCALES = [1, 1.15, 1.3] as const;
export type ConsoleScale = (typeof CONSOLE_SCALES)[number];

const KEY = "riichi.console.scale";

export function parseScale(raw: string | null): ConsoleScale {
  const v = Number(raw);
  return CONSOLE_SCALES.find((s) => s === v) ?? 1;
}

let current: ConsoleScale | null = null;
const listeners = new Set<() => void>();

function getScale(): ConsoleScale {
  current ??= parseScale(readLocal(KEY));
  return current;
}

export function setScale(next: ConsoleScale): void {
  current = next;
  writeLocal(KEY, String(next));
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** 当前档位（本机记住）；只读，不改根字号——改根字号的是 useConsoleScale。 */
export function useScale(): ConsoleScale {
  return useSyncExternalStore(subscribe, getScale, () => 1);
}
