import { useEffect, useId } from "react";
import type { UiIntent } from "@riichi/core";
import { useSocket } from "@/ws/useRoom";

/**
 * 把当前弹窗的意图同步到电视镜像：打开/内容变化时发送，关闭或卸载时清除。
 * 每个调用方是独立来源，同时打开多个时电视显示最近打开的那个。
 * enabled=false（主控台自身）时不发送。
 */
export function useMirror(open: boolean, intent: UiIntent, enabled: boolean): void {
  const socket = useSocket();
  const source = useId();
  const key = open ? JSON.stringify(intent) : "";
  useEffect(() => {
    if (!enabled) return;
    socket.setUi(source, key ? (JSON.parse(key) as UiIntent) : { kind: "none" });
  }, [key, enabled, socket, source]);
  useEffect(() => {
    if (!enabled) return;
    return () => socket.setUi(source, { kind: "none" });
  }, [enabled, socket, source]);
}
