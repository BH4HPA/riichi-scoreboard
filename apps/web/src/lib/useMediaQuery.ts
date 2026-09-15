import { useMemo, useSyncExternalStore } from "react";

/** 订阅媒体查询；无 window 时返回 false。订阅函数按 query 缓存，避免每次渲染重订阅。 */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => {
    if (typeof window === "undefined") {
      return { subscribe: () => () => undefined, getSnapshot: () => false };
    }
    const mql = window.matchMedia(query);
    return {
      subscribe: (onChange: () => void) => {
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
      },
      getSnapshot: () => mql.matches,
    };
  }, [query]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
}

/** 主控台双栏布局的最小宽度；以下（iPad 横屏 1024）走单栏 + 抽屉。 */
export const WIDE_CONSOLE_QUERY = "(min-width: 1280px)";
