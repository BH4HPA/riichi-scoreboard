import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

const isApp = (p: string) => !p.startsWith("/api/") && p !== "/ws" && p !== "/health";

/**
 * 托管前端构建产物；未知路径回退 index.html（SPA）。
 * 不托管（webDist 为 null 或目录不存在）且给了 redirectTo 时，页面路径 302 到那个站点的同路径；
 * 两者都没有则交给后面的 404。返回是否托管了静态文件。
 */
export function mountStatic(
  app: Hono,
  { webDist, redirectTo }: { webDist: string | null; redirectTo: string | null },
): boolean {
  const index = webDist ? path.join(webDist, "index.html") : null;
  if (!webDist || !index || !fs.existsSync(index)) {
    if (redirectTo) {
      const base = redirectTo.replace(/\/$/, "");
      app.get("/*", (c, next) => {
        if (!isApp(c.req.path)) return next();
        const url = new URL(c.req.url);
        return c.redirect(`${base}${url.pathname}${url.search}`, 302);
      });
    }
    return false;
  }
  const root = path.relative(process.cwd(), webDist) || ".";
  const html = fs.readFileSync(index, "utf8");
  app.use("/*", async (c, next) => (isApp(c.req.path) ? serveStatic({ root })(c, next) : next()));
  app.get("/*", (c, next) => (isApp(c.req.path) ? c.html(html) : next()));
  return true;
}
