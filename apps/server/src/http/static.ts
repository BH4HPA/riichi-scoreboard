import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

/** 托管前端构建产物；未知路径回退 index.html（SPA）。 */
export function mountStatic(app: Hono, webDist: string): boolean {
  const index = path.join(webDist, "index.html");
  if (!fs.existsSync(index)) return false;
  const root = path.relative(process.cwd(), webDist) || ".";
  app.use("/*", serveStatic({ root }));
  const html = fs.readFileSync(index, "utf8");
  app.get("/*", (c) => c.html(html));
  return true;
}
