import { useEffect, useState } from "react";
import { useRoomStore } from "@/ws/store";
import { cn } from "@/lib/utils";

/** 底部提示条：显示最近一次错误/信息，4 秒后自动消失。 */
export function Notice() {
  const notice = useRoomStore((s) => s.notice);
  const [dismissedAt, setDismissedAt] = useState(0);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setDismissedAt(notice.at), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice || notice.at <= dismissedAt) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
      <div
        className={cn(
          "max-w-md rounded-lg px-3 py-2 text-sm shadow-lg",
          notice.tone === "error" ? "bg-neg text-white" : "bg-fg text-bg",
        )}
      >
        {notice.text}
      </div>
    </div>
  );
}

/**
 * 连接状态徽标，连上时不显示。
 * `console`：主控台远看用大一号字，自动重连期间注明不用刷新——没人拿着它，断线时最怕有人去点刷新丢了现场；
 * 手机底栏放不下这句，保持原样。
 */
export function ConnectionBadge({ variant = "phone" }: { variant?: "phone" | "console" }) {
  const status = useRoomStore((s) => s.status);
  const hadRoom = useRoomStore((s) => s.room !== null);
  if (status === "open") return null;
  const text = {
    idle: "未连接",
    connecting: "连接中…",
    reconnecting: "重新连接中…",
    closed: "连接已关闭",
  }[status];
  // 看门狗掉线后的首次重连也是 connecting（退避计数为 0），同样是自动的；首次连房（还没拿到过房间）不是重连
  const auto =
    variant === "console" && (status === "reconnecting" || (status === "connecting" && hadRoom));
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-md bg-neg/15 text-neg",
        variant === "console" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
      )}
    >
      {text}
      {auto && "（自动重连，无需刷新）"}
    </span>
  );
}
