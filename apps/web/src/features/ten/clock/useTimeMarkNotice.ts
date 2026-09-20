import { useEffect, useRef } from "react";
import type { TenTimeMark } from "@riichi/core";
import { useRoomStore } from "@/ws/store";
import { TIME_MARK_TEXT } from "./marks";

/**
 * 档位升高时提示一次。首帧（刚进页面、刷新、重连后的第一份状态）只显示徽标不弹提示——
 * 否则时间到之后每刷新一次都弹。
 */
export function useTimeMarkNotice(mark: TenTimeMark): void {
  const notify = useRoomStore((s) => s.notify);
  const seen = useRef<TenTimeMark | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = mark;
    if (prev !== null && mark > prev && mark !== 0) notify("info", TIME_MARK_TEXT[mark]);
  }, [mark, notify]);
}
