import { useEffect, useRef } from "react";
import { useRoomStore } from "@/ws/store";
import { roomDraftStamp } from "./stamp";
import { draftKey, ensureDraft, updateDraft, useDraftStore, type DraftKind } from "./store";

function currentStamp(): string | null {
  const room = useRoomStore.getState().room;
  return room ? roomDraftStamp(room) : null;
}

/**
 * 结算表单读写自己的草稿（弹窗打开时已由 `ensureDraft` 备好）。
 * 表单开着时局面变了（别人记了一笔、撤销、调整场况）：关闭弹窗并提示，旧输入不会落到新局面上。
 * 自己提交期间到达的变化先不算——成功了那正是自己这笔；失败了（多半是被别人抢先）再关闭。
 */
export function useDraft<S>(kind: DraftKind, init: () => S, onStale: () => void) {
  const room = useRoomStore((s) => s.room)!;
  const notify = useRoomStore((s) => s.notify);
  const key = draftKey(room.code, kind);
  const entry = useDraftStore((s) => s.entries[key]);
  const generation = entry?.generation ?? 0;
  const submitting = useRef(false);
  const onStaleRef = useRef(onStale);
  useEffect(() => {
    onStaleRef.current = onStale;
  });

  // 结算表单只在对局中打开，此时一定有局面戳
  const stamp = roomDraftStamp(room)!;
  const stale = entry !== undefined && entry.stamp !== stamp;
  // 正常由打开弹窗的入口备好；兜底防止没有草稿时表单改不动
  useEffect(() => {
    if (!entry) ensureDraft(key, stamp);
  }, [entry, key, stamp]);
  useEffect(() => {
    if (!stale || submitting.current) return;
    notify("info", "局面已变化，结算已关闭");
    onStaleRef.current();
  }, [stale, notify]);

  return {
    state: (entry?.state as S | null) ?? init(),
    generation,
    update: (fn: (s: S) => S) => updateDraft(key, generation, init, fn),
    /** 包住提交命令：返回 false 且局面已变时关闭弹窗 */
    submit: async (run: () => Promise<boolean>): Promise<boolean> => {
      submitting.current = true;
      const ok = await run().finally(() => {
        submitting.current = false;
      });
      const entryNow = useDraftStore.getState().entries[key];
      if (!ok && entryNow && entryNow.stamp !== currentStamp()) {
        notify("info", "局面已变化，结算已关闭");
        onStaleRef.current();
      }
      return ok;
    },
  };
}
