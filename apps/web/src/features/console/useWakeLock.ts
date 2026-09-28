import { useEffect } from "react";

/**
 * 主控台常亮：Pad 立在桌边当记分牌，一局里常常几分钟没人碰，系统息屏后还得有人去解锁。
 * 屏幕锁在页面进入后台时由浏览器自动释放，所以回到前台要重新申请；不支持（iOS 16.4 以下等）或被拒时静默。
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    /** 申请在途：挂载时与回前台时的两次申请可能同时发出，拿到两把锁、先到的那把没人释放 */
    let requesting = false;
    const request = async () => {
      if (requesting || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        // 申请在途时卸载：拿到了也立刻还回去
        if (disposed) void next.release().catch(() => undefined);
        else lock = next;
      } catch {
        // 省电模式、权限策略或不支持：不影响记分
      } finally {
        requesting = false;
      }
    };
    const onVisible = () => void request();
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
