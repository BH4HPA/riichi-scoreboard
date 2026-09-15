/**
 * 保活节奏。线上经腾讯云 CDN 回源，CDN 对约 10 s 无数据的 WebSocket 会直接回收且不通知两端，
 * 所以客户端每 5 s 发一次 ping（与 bite-go 一致），并以「最近一次收到任何服务端消息」判定连接是否已死。
 */
export const HEARTBEAT_MS = 5_000;
/** 超过这个时长没有收到任何服务端消息（含 pong）就视为死连接，主动丢弃并重连 */
export const STALE_MS = 8_000;

export function isStale(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt > STALE_MS;
}
