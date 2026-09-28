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
