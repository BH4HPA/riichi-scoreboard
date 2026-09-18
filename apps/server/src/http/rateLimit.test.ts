import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { clientIp, rateLimit, SlidingWindow } from "./rateLimit";

describe("SlidingWindow", () => {
  it("窗口内按 key 计数，滑出后重新可用", () => {
    const w = new SlidingWindow(3, 1000);
    expect(w.allow("a", 0)).toBe(true);
    expect(w.allow("a", 1)).toBe(true);
    expect(w.allow("a", 2)).toBe(true);
    expect(w.allow("a", 3)).toBe(false);
    expect(w.allow("b", 3)).toBe(true);
    expect(w.allow("a", 1001)).toBe(true);
  });
});

describe("rateLimit", () => {
  it("超限 429；key 为 null 时放行", async () => {
    const app = new Hono();
    let key: string | null = "k";
    app.use(
      "*",
      rateLimit(
        new SlidingWindow(1),
        () => key,
        "太多了",
        () => 0,
      ),
    );
    app.get("/", (c) => c.text("ok"));
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(429);
    key = null;
    expect((await app.request("/")).status).toBe(200);
  });

  it("clientIp：只在 trustProxy 时读 X-Forwarded-For；无连接信息时为 null", async () => {
    const app = new Hono();
    const seen: Array<string | null> = [];
    app.get("/:trust", (c) => {
      seen.push(clientIp(c, c.req.param("trust") === "1"));
      return c.text("");
    });
    const headers = { "x-forwarded-for": "203.0.113.9, 10.0.0.1" };
    await app.request("/1", { headers });
    await app.request("/0", { headers });
    expect(seen).toEqual(["203.0.113.9", null]);
  });
});
