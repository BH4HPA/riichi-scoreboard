import { describe, expect, it } from "vitest";
import { WS_KEEPALIVE } from "@riichi/core";
import { HEARTBEAT_MS, isStale, STALE_MS } from "./heartbeat";

describe("heartbeat", () => {
  it("心跳间隔低于 CDN 10 s 回收阈值，看门狗阈值留出至少一次心跳的余量，服务端空闲阈值更长", () => {
    expect(HEARTBEAT_MS).toBeLessThan(10_000);
    expect(STALE_MS).toBeGreaterThan(HEARTBEAT_MS);
    expect(STALE_MS).toBeLessThan(2 * HEARTBEAT_MS + 1_000);
    expect(WS_KEEPALIVE.serverIdleMs).toBeGreaterThanOrEqual(3 * HEARTBEAT_MS);
  });

  it("刚收到消息不算死；超过阈值才算", () => {
    expect(isStale(1_000, 1_000 + STALE_MS)).toBe(false);
    expect(isStale(1_000, 1_000 + STALE_MS + 1)).toBe(true);
  });
});
