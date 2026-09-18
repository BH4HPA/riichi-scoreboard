import path from "node:path";
import type { Browser, BrowserContext, BrowserContextOptions } from "@playwright/test";

/** 与 playwright.config 里给构建的 VITE_STATIC_BASE_URL 同一个假域名 */
export const STATIC_BASE = "https://static.example.test/riichi";

/**
 * 所有用例都从这里开 context：手机一进房间就会预热识别模型（约 25 MB，static 桶），
 * 测试默认掐掉静态桶的请求，不碰外网；曲库清单换成 fixtures 里的两首假曲；
 * 需要模型的用例在 page 级再装路由覆盖（page 路由优先于 context 路由）。
 * 相机权限一并授予：取景框是识别的唯一入口。
 */
export async function newContext(
  browser: Browser,
  options?: BrowserContextOptions,
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ permissions: ["camera"], ...options });
  await ctx.route(`${STATIC_BASE}/**`, (route) => route.abort());
  await ctx.route(`${STATIC_BASE}/music/manifest.json`, (route) =>
    route.fulfill({ path: path.join(import.meta.dirname, "fixtures/music-manifest.json") }),
  );
  return ctx;
}
