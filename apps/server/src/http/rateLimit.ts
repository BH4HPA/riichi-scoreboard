import type { Context, Env, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

const HOUR = 60 * 60 * 1000;

/** 滑动窗口计数：key → 窗口内的命中时刻。 */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number = HOUR,
  ) {}

  allow(key: string, now: number): boolean {
    const since = now - this.windowMs;
    if (this.hits.size > 1000) this.sweep(since);
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    const ok = recent.length < this.limit;
    if (ok) recent.push(now);
    this.hits.set(key, recent);
    return ok;
  }

  private sweep(since: number): void {
    for (const [key, ts] of this.hits) {
      if (!ts.some((t) => t > since)) this.hits.delete(key);
    }
  }
}

/**
 * 请求方 IP。经反向代理/CDN 部署时真实地址只在 X-Forwarded-For 里，但该头可由客户端伪造，
 * 所以只在 trustProxy 时读它。没有连接信息（测试里的 app.request）时为 null。
 */
export function clientIp(c: Context, trustProxy: boolean): string | null {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/** 超限回 429；key 为 null（无法识别请求方）时放行。 */
export function rateLimit<E extends Env = Env>(
  window: SlidingWindow,
  key: (c: Context<E>) => string | null,
  message: string,
  now: () => number = Date.now,
): MiddlewareHandler<E> {
  return async (c, next) => {
    const k = key(c);
    if (k !== null && !window.allow(k, now())) {
      return c.json({ error: "too_many", message }, 429);
    }
    await next();
  };
}
