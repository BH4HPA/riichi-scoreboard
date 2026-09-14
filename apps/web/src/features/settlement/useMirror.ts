import { useEffect, useRef } from "react";
import type { UiIntent } from "@riichi/core";
import { useSocket } from "@/ws/useRoom";

/**
 * 把当前弹窗的意图同步到电视镜像：打开/内容变化时发送，关闭或卸载时清除。
 * enabled=false（主控台自身）时不发送。
 */
export function useMirror(open: boolean, intent: UiIntent | null, enabled: boolean): void {
  const socket = useSocket();
  const key = JSON.stringify(open ? intent : null);
  const last = useRef<string>("");
  useEffect(() => {
    if (!enabled) return;
    if (key === last.current) return;
    last.current = key;
    socket.setUi(open && intent ? intent : { kind: "none" });
  }, [key, open, intent, enabled, socket]);
  useEffect(() => {
    if (!enabled) return;
    return () => {
      if (last.current !== "null" && last.current !== "") socket.setUi({ kind: "none" });
    };
  }, [enabled, socket]);
}
