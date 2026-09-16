export type DeviceKind = "phone" | "tablet" | "desktop";

interface NavigatorLike {
  userAgent: string;
  platform?: string | undefined;
  maxTouchPoints?: number | undefined;
  userAgentData?: { mobile?: boolean | undefined } | undefined;
}

/**
 * 设备分流：手机 → 加入页；平板 → 二选一；桌面 → 主控台。
 * 先按 UA 识别平板（iPad / Android 无 Mobile 标记）；再把 `userAgentData.mobile === true` 当手机信号
 * （Android 平板会给 false，不能据此判桌面）；iPadOS 13+ 的 Safari 用桌面 UA，靠 MacIntel + 多点触控识别。
 */
export function deviceKind(nav: NavigatorLike = navigator as unknown as NavigatorLike): DeviceKind {
  const ua = nav.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
  if (nav.userAgentData?.mobile === true) return "phone";
  if (/iPhone|iPod|Android|Windows Phone|Mobile/i.test(ua)) return "phone";
  if (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1) return "tablet";
  return "desktop";
}

/** 扫码与取景框都要相机 API + 安全上下文（HTTPS 或 localhost）。 */
export function canUseCamera(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    window.isSecureContext
  );
}
