import { devices, expect, test } from "@playwright/test";
import { newContext } from "./helpers";

test("桌面 UA 打开首页直接进主控台；?stay=1 留在首页", async ({ browser }) => {
  const ctx = await newContext(browser, { ...devices["Desktop Chrome"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByTestId("room-code")).toBeVisible();
  await page.goto("/?stay=1");
  await expect(page.getByRole("link", { name: /打开主控台/ })).toBeVisible();
  await ctx.close();
});

test("平板 UA 二选一：可进主控台，也可作为玩家输码加入", async ({ browser }) => {
  const ctx = await newContext(browser, { ...devices["iPad Pro 11"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /打开主控台/ })).toBeVisible();
  await page.getByRole("button", { name: "作为玩家加入房间" }).click();
  await expect(page.getByLabel("房间码")).toBeAttached();
  await page.getByRole("button", { name: "返回选择" }).click();
  await expect(page.getByRole("link", { name: /打开主控台/ })).toBeVisible();
  await ctx.close();
});

test("手机 UA 直接看到加入面板；HTTP 下扫码入口隐藏并提示；输码跳转房间", async ({ browser }) => {
  const tvCtx = await newContext(browser, { ...devices["Desktop Chrome"] });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";

  const ctx = await newContext(browser, { ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByLabel("房间码")).toBeAttached();
  // 测试环境是 http://127.0.0.1（浏览器视为安全上下文）且 Chromium 有 mediaDevices → 显示扫码入口
  await expect(page.getByRole("button", { name: /扫描主控台二维码/ })).toBeVisible();
  await expect(page.getByText(/无法在网页里调用相机/)).toHaveCount(0);
  // 不存在的房间码：抖动 + 提示，输入保留
  await page.getByLabel("房间码").fill("ZZZZZZ");
  await expect(page.getByText("房间不存在，请核对房间码")).toBeVisible();
  await expect(page.getByLabel("房间码")).toHaveValue("ZZZZZZ");
  // 正确房间码（小写也可）：输满自动进房
  await page.getByLabel("房间码").fill(code.toLowerCase());
  await expect(page).toHaveURL(new RegExp(`/r/${code}$`));
  await expect(page.getByTestId("seat-0")).toBeVisible();
  await ctx.close();
  await tvCtx.close();
});

test("未知路径（如少了房间码的 /r/）回首页", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/r/");
  await expect(page).not.toHaveURL(/\/r\//);
  await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
  await ctx.close();
});
