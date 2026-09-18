import type { Undoable } from "../types/state";

/**
 * 撤销栈保留的快照数。每个快照都持有整份历史数组，无上限时一局内连续提交 N 条命令占 O(N²) 内存，
 * 且回放时同样复现；真实一局几十条结算远低于此。
 */
export const UNDO_LIMIT = 64;

export function createUndoable<T>(present: T): Undoable<T> {
  return { past: [], present, future: [] };
}

export function push<T>(u: Undoable<T>, next: T): Undoable<T> {
  const past = [...u.past, u.present];
  return {
    past: past.length > UNDO_LIMIT ? past.slice(-UNDO_LIMIT) : past,
    present: next,
    future: [],
  };
}

export function undo<T>(u: Undoable<T>): Undoable<T> | null {
  const previous = u.past[u.past.length - 1];
  if (previous === undefined) return null;
  return { past: u.past.slice(0, -1), present: previous, future: [u.present, ...u.future] };
}

export function redo<T>(u: Undoable<T>): Undoable<T> | null {
  const [next, ...rest] = u.future;
  if (next === undefined) return null;
  return { past: [...u.past, u.present], present: next, future: rest };
}
