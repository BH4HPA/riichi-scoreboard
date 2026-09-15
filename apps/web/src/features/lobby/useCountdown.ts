import { useCallback, useSyncExternalStore } from "react";

/** 目标时刻（epoch ms）到现在的剩余整秒；null 表示没有倒计时。每 250 ms 用本地时钟重算。 */
export function useCountdown(at: number | null): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (at === null) return () => undefined;
      const timer = setInterval(onChange, 250);
      return () => clearInterval(timer);
    },
    [at],
  );
  const snapshot = useCallback(
    () => (at === null ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000))),
    [at],
  );
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
