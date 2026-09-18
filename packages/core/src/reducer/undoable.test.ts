import { describe, expect, it } from "vitest";
import { createUndoable, push, redo, undo, UNDO_LIMIT } from "./undoable";

describe("undoable", () => {
  it("push 清空 redo 栈，undo/redo 往返", () => {
    let u = createUndoable(0);
    u = push(u, 1);
    u = push(u, 2);
    u = undo(u)!;
    expect(u.present).toBe(1);
    expect(u.future).toEqual([2]);
    u = push(u, 3);
    expect(u.future).toEqual([]);
    expect(redo(u)).toBeNull();
    expect(undo(createUndoable(0))).toBeNull();
  });

  it("past 最多保留 UNDO_LIMIT 个快照，丢最早的", () => {
    let u = createUndoable(0);
    for (let i = 1; i <= UNDO_LIMIT + 10; i++) u = push(u, i);
    expect(u.past).toHaveLength(UNDO_LIMIT);
    expect(u.past[0]).toBe(10);
    expect(u.present).toBe(UNDO_LIMIT + 10);
  });
});
