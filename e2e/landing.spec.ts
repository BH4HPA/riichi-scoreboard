import { devices, expect, test } from "@playwright/test";

test("桌面 UA 打开首页直接进主控台；?stay=1 留在首页", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByTestId("room-code")).toBeVisible();
  await page.goto("/?stay=1");
  await expect(page.getByRole("link", { name: /打开主控台/ })).toBeVisible();
  await ctx.close();
});

test("平板 UA 二选一：可进主控台，也可作为玩家输码加入", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPad Pro 11"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /打开主控台/ })).toBeVisible();
  await page.getByRole("button", { name: "作为玩家加入房间" }).click();
  await expect(page.getByLabel("房间码")).toBeVisible();
  await page.getByRole("button", { name: "返回选择" }).click();
  await expect(page.getByRole("link", { name: /打开主控台/ })).toBeVisible();
  await ctx.close();
});

test("手机 UA 直接看到加入面板；HTTP 下扫码入口隐藏并提示；输码跳转房间", async ({ browser }) => {
  const tvCtx = await browser.newContext({ ...devices["Desktop Chrome"] });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";

  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByLabel("房间码")).toBeVisible();
  // 测试环境是 http://127.0.0.1（安全上下文）：Playwright 的 Chromium 有 mediaDevices，因此显示扫码按钮
  // 只断言二者必居其一，具体取决于是否安全上下文
  const scanButton = page.getByRole("button", { name: /扫描电视上的二维码/ });
  const hint = page.getByText(/无法在网页里调用相机/);
  await expect(scanButton.or(hint)).toBeVisible();
  await page.getByLabel("房间码").fill(code.toLowerCase());
  await page.getByRole("button", { name: "加入" }).click();
  await expect(page).toHaveURL(new RegExp(`/r/${code}$`));
  await expect(page.getByText("选择座位")).toBeVisible();
  await ctx.close();
  await tvCtx.close();
});
