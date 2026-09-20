import { useEffect, useRef } from "react";
import { useRoomStore } from "@/ws/store";
import { roomDraftStamp } from "./stamp";

/**
 * 写入一局结果的弹窗都要盯着局面戳：两台设备同时开着同一个确认（流局、途中流局、错和、调整场况），
 * 一台确认后另一台的弹窗文案看起来仍然成立，再点一次就多记一局。
 * 戳变了就提示并关闭；自己提交期间到达的变化正是自己这一笔，不算。
 * 自摸 / 荣和另有草稿（`useDraft`），同一套判据在那里。
 *
 * `active`：弹窗开着（表单随弹窗挂载的不用传）。返回的 `submit` 用来包住提交命令。
 */
export function useCloseOnStale(onStale: () => void, active = true) {
  const room = useRoomStore((s) => s.room);
  const notify = useRoomStore((s) => s.notify);
  const stamp = room ? roomDraftStamp(room) : null;
  const opened = useRef<string | null>(null);
  const submitting = useRef(false);
  const close = useRef(onStale);
  useEffect(() => {
    close.current = onStale;
  });
  useEffect(() => {
    if (!active) {
      opened.current = null;
      return;
    }
    if (opened.current === null) opened.current = stamp;
    if (opened.current === stamp || submitting.current) return;
    notify("info", "局面已变化，结算已关闭");
    close.current();
  }, [active, stamp, notify]);

  return async <T>(run: () => Promise<T>): Promise<T> => {
    submitting.current = true;
    try {
      return await run();
    } finally {
      submitting.current = false;
    }
  };
}
