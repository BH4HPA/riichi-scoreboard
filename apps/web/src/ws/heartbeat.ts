import { WS_KEEPALIVE } from "@riichi/core";

/**
 * 保活节奏（常量定义在 core，与服务端空闲断开阈值同源）。线上经腾讯云 CDN 回源，CDN 对约 10 s
 * 无数据的 WebSocket 会直接回收且不通知两端，所以客户端每 5 s 发一次 ping，
 * 并以「最近一次收到任何服务端消息」判定连接是否已死。
 */
export const HEARTBEAT_MS: number = WS_KEEPALIVE.pingMs;
/** 超过这个时长没有收到任何服务端消息（含 pong）就视为死连接，主动丢弃并重连 */
export const STALE_MS: number = WS_KEEPALIVE.staleMs;

export function isStale(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt > STALE_MS;
}
