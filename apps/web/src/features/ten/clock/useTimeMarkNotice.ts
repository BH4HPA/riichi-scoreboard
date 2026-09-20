import { useEffect, useRef } from "react";
import type { TenStage, TenTimeMark } from "@riichi/core";
import { useRoomStore } from "@/ws/store";
import { timeMarkText } from "./marks";

/**
 * 档位升高时提示一次。刚进页面（含刷新）看到的第一份状态只显示徽标不弹提示——否则时间到之后每刷新一次都弹。
 * 断线自动重连不算「刚进页面」：页面没有重挂，断线期间跨了档，重连后照常提示。
 */
export function useTimeMarkNotice(mark: TenTimeMark, stage: TenStage["kind"]): void {
  const notify = useRoomStore((s) => s.notify);
  const seen = useRef<TenTimeMark | null>(null);
  // 只在档位变化时提示；阶段只决定那一刻的措辞，不是触发条件
  const stageNow = useRef(stage);
  useEffect(() => {
    stageNow.current = stage;
  });
  useEffect(() => {
    const prev = seen.current;
    seen.current = mark;
    if (prev !== null && mark > prev && mark !== 0) {
      notify("info", timeMarkText(mark, stageNow.current));
    }
  }, [mark, notify]);
}
