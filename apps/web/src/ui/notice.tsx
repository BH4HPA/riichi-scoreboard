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

export function ConnectionBadge() {
  const status = useRoomStore((s) => s.status);
  if (status === "open") return null;
  const text = {
    idle: "未连接",
    connecting: "连接中…",
    reconnecting: "重新连接中…",
    closed: "连接已关闭",
  }[status];
  return <span className="rounded-md bg-neg/15 px-2 py-0.5 text-xs text-neg">{text}</span>;
}
