import { devices, expect, test } from "@playwright/test";
import { newContext } from "./helpers";

test("桌面 UA 打开首页先选房型：创建四人房；回首页后按钮变成「继续 + 新建」，再创建二人房", async ({
  browser,
}) => {
  const ctx = await newContext(browser, { ...devices["Desktop Chrome"] });
  const page = await ctx.newPage();
  await page.goto("/");
  // 不再自动跳主控台：两种房型都摆在首页
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("open-yonma")).toHaveText(/创建四人麻将房间/);
  await expect(page.getByTestId("open-ten")).toHaveText(/创建二人麻将房间/);
  await page.getByTestId("open-yonma").click();
  await expect(page).toHaveURL(/\/console\?kind=yonma$/);
  const first = (await page.getByTestId("room-code").textContent())!.trim();
  await expect(page.getByText("四人都点「准备」后即可开局")).toBeVisible();

  // 主控台有回首页的出口：房型是在首页选的
  await page.getByRole("link", { name: "返回首页" }).click();
  await expect(page).toHaveURL(/\/$/);
  // 那个房间还开着：文案如实写「继续」，不会点了「创建」却进到旧房间
  await expect(page.getByTestId("open-yonma")).toHaveText(new RegExp(`继续四人麻将房间 ${first}`));
  await page.getByTestId("open-yonma").click();
  await expect(page.getByTestId("room-code")).toHaveText(first);

  await page.getByRole("link", { name: "返回首页" }).click();
  await page.getByTestId("new-yonma").click();
  await expect(page.getByTestId("room-code")).not.toHaveText(first);

  // 二人房另记一个码，互不影响
  await page.getByRole("link", { name: "返回首页" }).click();
  await page.getByTestId("open-ten").click();
  await expect(page).toHaveURL(/\/console\?kind=ten$/);
  await expect(page.getByText("两人都点「准备」后即可开局")).toBeVisible();
  await expect(page.getByTestId("seat-0")).toBeVisible();
  await expect(page.getByTestId("seat-2")).toHaveCount(0);
  await ctx.close();
});

test("旧书签 /console（不带房型）仍然是四人房", async ({ browser }) => {
  const ctx = await newContext(browser, { ...devices["Desktop Chrome"] });
  const page = await ctx.newPage();
  await page.goto("/console");
  await expect(page.getByTestId("room-code")).toBeVisible();
  await expect(page.getByTestId("seat-3")).toBeVisible();
  await ctx.close();
});

test("平板 UA：可开房间，也可作为玩家输码加入", async ({ browser }) => {
  const ctx = await newContext(browser, { ...devices["iPad Pro 11"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByTestId("open-yonma")).toBeVisible();
  await page.getByRole("button", { name: "作为玩家加入房间" }).click();
  await expect(page.getByLabel("房间码")).toBeAttached();
  await page.getByRole("button", { name: "返回选择" }).click();
  await expect(page.getByTestId("open-ten")).toBeVisible();
  // 窄屏主控台（Pad 竖屏单栏）：版权与备案号在页面底部
  await page.getByTestId("open-yonma").click();
  await expect(page.getByTestId("room-code")).toBeVisible();
  await page.keyboard.press("Escape"); // 窄屏首次进大厅自动弹二维码
  await expect(page.locator("footer").getByRole("link", { name: /ICP/ })).toBeInViewport();
  await expect(
    page.locator("footer").getByRole("link", { name: /^© .+ \d{4}-\d{4}$/ }),
  ).toBeInViewport();
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
  await expect(page.getByRole("link", { name: /^© .+ \d{4}-\d{4}$/ })).toBeInViewport();
  await expect(page.getByRole("link", { name: /ICP备/ })).toBeInViewport();
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
  // 回首页：上次的房间仍在 → 「返回房间」一键回去
  await page.goto("/");
  await page.getByRole("link", { name: `返回房间 ${code}` }).click();
  await expect(page.getByTestId("seat-0")).toBeVisible();
  // 不存在的房间链接：有原因、有出口
  await page.goto("/r/AAAAAA");
  await expect(page.getByText("房间 AAAAAA 不存在")).toBeVisible();
  await page.getByRole("link", { name: "返回首页" }).click();
  await expect(page.getByLabel("房间码")).toBeAttached();
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
  // 普通按键排下的延后清理，撞上紧接着开始的组词也不能改写 input（CI 上曾复现成 XV5xv54）
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('input[aria-label="房间码"]')!;
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  });
  await page.keyboard.type("q"); // 非组词 input → 排下清理；此时 composing 已为真，清理应跳过
  await page.evaluate(() => new Promise((r) => setTimeout(r, 20)));
  await expect(input).toHaveValue("q");
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('input[aria-label="房间码"]')!;
    el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await expect(input).toHaveValue("Q");
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("");
  for (let i = 1; i <= code.length; i++) await compose(code.slice(0, i).toLowerCase());
  await expect(page).toHaveURL(new RegExp(`/r/${code}$`));
  await ctx.close();
  await tvCtx.close();
});

test("PWA：页面声明的 manifest 可解析，图标都取得到且是图片", async ({ request, page }) => {
  await page.goto("/");
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
