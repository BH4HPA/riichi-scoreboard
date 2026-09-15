import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { mountStatic } from "./static";

describe("mountStatic", () => {
  it("不托管且有前端站点时，页面路径 302 到该站点同路径（带 query）；接口路径不动", async () => {
    const app = new Hono();
    expect(mountStatic(app, { webDist: null, redirectTo: "https://riichi.example.com/" })).toBe(
      false,
    );
    app.get("/health", (c) => c.json({ ok: true }));
    const res = await app.request("/r/ABC234?x=1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://riichi.example.com/r/ABC234?x=1");
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/api/nothing")).status).toBe(404);
  });

  it("不托管且没有前端站点时，页面路径 404", async () => {
    const app = new Hono();
    mountStatic(app, { webDist: "/nonexistent", redirectTo: null });
    expect((await app.request("/console")).status).toBe(404);
  });
});
