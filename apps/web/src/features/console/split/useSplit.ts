import { useEffect, useState } from "react";
import { clampSplit, DEFAULT_SPLIT, HANDLE_PX } from "./clampSplit";

const KEY = "riichi.console.split";

function readSplit(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 && v < 1 ? v : DEFAULT_SPLIT;
  } catch {
    return DEFAULT_SPLIT;
  }
}

function writeSplit(v: number): void {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* 无痕模式等写不进去：只是不记忆 */
  }
}

/** 宽屏对局页比分/历史的分隔比例：本机记忆，按容器实际宽度夹在两栏最小宽度之间。 */
export function useSplit() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(readSplit);

  useEffect(() => {
    if (!container) return;
    // 两栏可分的宽度 = 容器宽 − 拖动条
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(0, entry!.contentRect.width - HANDLE_PX)),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  return {
    /** 作为回调 ref 挂到两栏的网格容器上 */
    attach: setContainer,
    ratio: clampSplit(ratio, width),
    /** 指针横坐标 → 比例 */
    ratioAt: (clientX: number) =>
      container && width > 0
        ? (clientX - container.getBoundingClientRect().left - HANDLE_PX / 2) / width
        : ratio,
    set: (next: number) => {
      const v = clampSplit(next, width);
      setRatio(v);
      writeSplit(v);
    },
  };
}
