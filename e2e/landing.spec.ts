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
  // 窄屏主控台（Pad 竖屏单栏）：版权与备案号在页面底部
  await page.getByRole("link", { name: /打开主控台/ }).click();
  await expect(page.getByTestId("room-code")).toBeVisible();
  await page.keyboard.press("Escape"); // 窄屏首次进大厅自动弹二维码
  await expect(page.locator("footer").getByRole("link", { name: /ICP/ })).toBeInViewport();
  await expect(page.locator("footer").getByRole("link", { name: /^© Ray/ })).toBeInViewport();
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
  await expect(page.getByRole("link", { name: /^© Ray 2014-\d{4}$/ })).toBeInViewport();
  await expect(page.getByRole("link", { name: "浙ICP备2022018560号-2" })).toBeInViewport();
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

test("输入法组词中输房间码：组词期间不改写 input，输满即校验，组词结束后清理成规范码", async ({
  browser,
}) => {
  // Chromium 不会复现 WebKit 的「改值打断组词 → 重复插入」，这条只防回归：组词路径照样能输码进房
  const tvCtx = await newContext(browser, { ...devices["Desktop Chrome"] });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";

  const ctx = await newContext(browser, { ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const input = page.getByLabel("房间码");
  const compose = (text: string) =>
    cdp.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  await page.goto("/");
  await input.focus();

  // 不存在的房间：组词中输满就校验；组词期间 input 保持原样（小写 + 拼音分隔符）
  for (const text of ["z", "zz", "zz'z", "zz'zz", "zz'zzz", "zz'zzzz"]) await compose(text);
  await expect(page.getByText("房间不存在，请核对房间码")).toBeVisible();
  await expect(input).toHaveValue("zz'zzzz");
  // 结束组词（上屏原文）→ 清理成规范码
  await cdp.send("Input.insertText", { text: "zz'zzzz" });
  await expect(input).toHaveValue("ZZZZZZ");

  // 退格清空（组词结束后没有隐形字符，六下正好删完；光标恒在末尾，fill 的全选删不掉）后组词输入正确房间码 → 进房
  for (let i = 0; i < 6; i++) await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("");
  for (let i = 1; i <= code.length; i++) await compose(code.slice(0, i).toLowerCase());
  await expect(page).toHaveURL(new RegExp(`/r/${code}$`));
  await ctx.close();
  await tvCtx.close();
});

test("PWA：页面声明的 manifest 可解析，图标都取得到且是图片", async ({ request, page }) => {
  await page.goto("/?stay=1");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = (await (await request.get(href!)).json()) as {
    display: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest.display).toBe("standalone");
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  for (const src of [...manifest.icons.map((i) => i.src), touch!, "/favicon.ico"]) {
    const res = await request.get(src);
    expect(res.status(), src).toBe(200);
    expect(res.headers()["content-type"], src).toMatch(/^image\//);
  }
});

test("未知路径（如少了房间码的 /r/）回首页", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/r/");
  await expect(page).not.toHaveURL(/\/r\//);
  await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
  await ctx.close();
});
