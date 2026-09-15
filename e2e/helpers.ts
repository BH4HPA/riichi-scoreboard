import type { Browser, BrowserContext, BrowserContextOptions } from "@playwright/test";

/**
 * 所有用例都从这里开 context：手机一进房间就会预热识别模型（约 25 MB，static 桶），
 * 测试默认掐掉静态桶的请求，不碰外网；需要模型的用例在 page 级再装路由覆盖（page 路由优先于 context 路由）。
 */
export async function newContext(
  browser: Browser,
  options?: BrowserContextOptions,
): Promise<BrowserContext> {
  const ctx = await browser.newContext(options);
  await ctx.route("https://static.bitego.net/**", (route) => route.abort());
  return ctx;
}
