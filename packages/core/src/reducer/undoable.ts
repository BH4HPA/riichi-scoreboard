import type { Undoable } from "../types/state";

export function createUndoable<T>(present: T): Undoable<T> {
  return { past: [], present, future: [] };
}

export function push<T>(u: Undoable<T>, next: T): Undoable<T> {
  return { past: [...u.past, u.present], present: next, future: [] };
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
