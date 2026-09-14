import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

/** 托管前端构建产物；未知路径回退 index.html（SPA）。 */
export function mountStatic(app: Hono, webDist: string): boolean {
  const index = path.join(webDist, "index.html");
  if (!fs.existsSync(index)) return false;
  const root = path.relative(process.cwd(), webDist) || ".";
  const html = fs.readFileSync(index, "utf8");
  const isApp = (path: string) => !path.startsWith("/api/") && path !== "/ws" && path !== "/health";
  app.use("/*", async (c, next) => (isApp(c.req.path) ? serveStatic({ root })(c, next) : next()));
  app.get("/*", (c, next) => (isApp(c.req.path) ? c.html(html) : next()));
  return true;
}
