import { useSyncExternalStore } from "react";

/** 订阅媒体查询；无 window 时返回 false。 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    () => false,
  );
}

/** 主控台双栏布局的最小宽度；以下（iPad 横屏 1024）走单栏 + 抽屉。 */
export const WIDE_CONSOLE_QUERY = "(min-width: 1280px)";
