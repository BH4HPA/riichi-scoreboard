import path from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { newContext } from "./helpers";

/** 假检测器（ml/scripts/e2e_detector.py）：恒定输出下面这副手牌的检测框，链路其余部分都是真的 */
const DETECTOR = path.join(import.meta.dirname, "fixtures/detector.onnx");

/** 123m 4筒 赤5筒 6筒 789s 789m 22p，和张 9m：平和 + 赤宝牌 = 2 番 30 符 */
const CLOSED = [1, 2, 3, 13, 36, 15, 25, 26, 27, 7, 8, 11, 11, 9];

type Setup = (page: Page) => Promise<void>;

async function phone(browser: Browser, code: string, setup?: Setup): Promise<Page> {
  const ctx = await newContext(browser, { viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  await setup?.(page);
  await page.goto(`/r/${code}`);
  await expect(page.getByTestId("seat-0")).toBeVisible();
  return page;
}

/**
 * 开房、四台手机入座准备、自动开局，返回手机 2 已打开的荣和对话框（放铳者北家、牌面页）。
 * setup 在手机 2 进房间之前装路由：进房间就会预热模型，拦截必须先于导航。
 */
async function openRonHandTab(
  browser: Browser,
  setup?: Setup,
): Promise<{ phone: Page; dialog: Locator }> {
  const tvCtx = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  const NAMES = ["东家", "南家", "西家", "北家"];
  const phones: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await phone(browser, code, i === 2 ? setup : undefined);
    const nameInput = p.getByLabel("昵称");
    await nameInput.fill(NAMES[i]!);
    await nameInput.press("Enter");
    await p.getByTestId(`seat-${i}`).click();
    await expect(p.getByTestId(`seat-${i}`)).toContainText(NAMES[i]!);
    await p.getByRole("button", { name: "准备", exact: true }).click();
    phones.push(p);
  }
  await expect(phones[2]!.getByTestId("points-0")).toHaveText("25,000");
  const p = phones[2]!;
  await p.getByRole("button", { name: "荣和", exact: true }).click();
  const dialog = p.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await p.getByRole("option", { name: "北家" }).click();
  await dialog.getByRole("tab", { name: "牌面" }).click();
  return { phone: p, dialog };
}

/** 装上假模型；patches 非空时顺便把 PATCH 体记下来 */
function withDetector(patches?: Record<string, unknown>[]): Setup {
  return async (page) => {
    // 进房间时预热的就是这个假模型（真模型在 CDN，测试不碰网络）
    await page.route("**/riichi/models/*.onnx", (route) =>
      route.fulfill({ path: DETECTOR, contentType: "application/octet-stream" }),
    );
    await page.route("**/api/recognitions/*", async (route) => {
      patches?.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 204 });
    });
  };
}

/** 打开取景框，等自动定格把结果灌回牌面页 */
async function shoot(p: Page, dialog: Locator): Promise<void> {
  await dialog.getByTestId("recognize-button").click();
  await expect(p.getByTestId("camera-sheet")).toBeVisible();
  // 假检测器每帧输出相同，连续三帧一致必然触发自动定格
  await expect(p.getByTestId("camera-sheet")).toHaveCount(0, { timeout: 30_000 });
}

/**
 * 预览画在 canvas 上（绕开 iOS 视频图层开流后尺寸画错的问题），这里核对画布真画出了画面且铺满。
 * 取景期间逐帧量，直到取景页关闭：取景区域高度不变；预览画布画出了画面且铺满区域；
 * 实时识别行出现过且没被裁掉。
 */
function sampleViewfinder(p: Page) {
  return p.evaluate(
    () =>
      new Promise<{
        min: number;
        max: number;
        live: boolean;
        clipped: boolean;
        uncovered: boolean;
        shown: boolean;
        progress: boolean;
      }>((resolve) => {
        let min = Infinity;
        let max = 0;
        let live = false;
        let clipped = false;
        let uncovered = false;
        let shown = false;
        let progress = false;
        let seen = false;
        const tick = () => {
          const area = document.querySelector('[data-testid="camera-area"]');
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-testid="camera-preview"]',
          );
          if (area && canvas) {
            seen = true;
            const a = area.getBoundingClientRect();
            min = Math.min(min, a.height);
            max = Math.max(max, a.height);
            if (canvas.dataset.painted === "true" && canvas.width > 8 && canvas.height > 8) {
              // 画布元素永远铺满，要看的是像素：中心与四角附近都画上了东西（假摄像头的测试图不是纯黑）
              const ctx = canvas.getContext("2d")!;
              const lit = (x: number, y: number) => {
                const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
                return r! + g! + b! > 0;
              };
              const w = canvas.width;
              const h = canvas.height;
              // 中心没画（停流瞬间画布已清空、状态还没同步）就不看四角，免得误判
              const center = lit(w >> 1, h >> 1);
              shown ||= center;
              uncovered ||=
                center &&
                ![
                  [4, 4],
                  [w - 5, 4],
                  [4, h - 5],
                  [w - 5, h - 5],
                ].every(([x, y]) => lit(x!, y!));
            }
            const slot = document.querySelector('[data-testid="camera-live"]');
            live ||= Boolean(slot?.querySelector("img"));
            progress ||= /^\d+\/14 · \d\/3$/.test(
              document.querySelector('[data-testid="camera-progress"]')?.textContent ?? "",
            );
            clipped ||= slot !== null && slot.scrollHeight > slot.clientHeight + 1;
          } else if (seen) {
            return resolve({ min, max, live, clipped, uncovered, shown, progress });
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

test("取景 → 自动定格 → 填入牌面并自动算番 → 检测框与结算后的真值都回填", async ({ browser }) => {
  const patches: Record<string, unknown>[] = [];
  const { phone: p, dialog } = await openRonHandTab(browser, withDetector(patches));

  const heights = sampleViewfinder(p);
  await shoot(p, dialog);
  const measured = await heights;
  expect(measured.live).toBe(true);
  expect(measured.max - measured.min).toBeLessThan(1);
  expect(measured.clipped).toBe(false);
  expect(measured.shown).toBe(true);
  // 右上角小字进度「14/14 · 1/3」
  expect(measured.progress).toBe(true);
  expect(measured.uncovered).toBe(false);
  await expect(dialog.getByTestId("recognize-button")).toHaveText("重新拍照");

  // 识别自洽 → 收起键盘，只剩一排牌
  const confirm = dialog.getByTestId("hand-confirm");
  await expect(confirm).toBeVisible();
  await expect(dialog.getByTestId("tile-keyboard")).toHaveCount(0);
  // 假检测器给赤5筒 0.45 的置信度：不再报红字，改成那张牌自己带「请核对」记号
  await expect(confirm.getByRole("button", { name: "赤5筒" })).toHaveAttribute("data-mark", "true");
  await expect(confirm.getByRole("button", { name: "1萬" })).not.toHaveAttribute("data-mark");
  await expect(dialog.getByText(/置信度/)).toHaveCount(0);
  // 一张宝牌指示牌都没认出来时留空位，不是整行消失
  await expect(confirm.getByText("宝牌指示")).toBeVisible();
  await expect(dialog.getByText("2 番 30 符")).toBeVisible();
  await expect(dialog.getByText("赤宝牌 1 番")).toBeVisible();

  await dialog.getByRole("button", { name: "确认荣和" }).click();
  await expect(p.getByTestId("points-2")).toHaveText("27,000");
  await expect.poll(() => patches.some((x) => "corrected" in x)).toBe(true);
  const recognized = patches.find((x) => "detections" in x)!;
  expect((recognized.detections as unknown[]).length).toBe(14);
  expect((recognized.recognized as { winTile: number }).winTile).toBe(9);
  const corrected = patches.find((x) => "corrected" in x)!.corrected as {
    closed: number[];
    winTile: number;
  };
  expect(corrected.closed).toEqual(CLOSED);
  expect(corrected.winTile).toBe(9);
});

test("连拍两张：第二次打开取景框仍能识别（模型字节被转移过就会在这里挂）", async ({ browser }) => {
  const { phone: p, dialog } = await openRonHandTab(browser, withDetector());
  await shoot(p, dialog);
  await expect(dialog.getByTestId("hand-confirm")).toBeVisible();

  // 第二次：Worker 重建，用的是同一份缓存的模型字节；画面照样铺满（iOS 上曾经只有第一次铺满）
  const second = sampleViewfinder(p);
  await shoot(p, dialog);
  const again = await second;
  await expect(p.getByTestId("camera-sheet")).toHaveCount(0, { timeout: 30_000 });
  expect(again.shown).toBe(true);
  expect(again.uncovered).toBe(false);
  await expect(dialog.getByTestId("hand-confirm")).toBeVisible();
  await expect(dialog.getByTestId("recognize-button")).toHaveText("重新拍照");
});

test("模型加载失败 → 取景页给出错误，牌面不变", async ({ browser }) => {
  const { phone: p, dialog } = await openRonHandTab(browser, (page) =>
    page.route("**/riichi/models/*.onnx", (route) => route.abort()),
  );

  await dialog.getByTestId("recognize-button").click();
  const sheet = p.getByTestId("camera-sheet");
  await expect(sheet).toBeVisible();
  // 模型下载被拦掉时才会走到这里：说明本地的 wasm 运行时已加载成功
  await expect(sheet.getByText(/fetch/i)).toBeVisible({ timeout: 20_000 });
  // 模型没就绪：快门不出现
  await expect(sheet.getByTestId("camera-shutter")).toHaveCount(0);
  // 看「怎么摆」时停流：视频断开、预览画布复位；关掉说明再接上，新流画出画面才算在出画面
  const video = sheet.getByTestId("camera-video");
  const preview = sheet.getByTestId("camera-preview");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.srcObject !== null)).toBe(true);
  await expect(preview).toHaveAttribute("data-painted", "true");
  await sheet.getByRole("button", { name: "怎么摆" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.srcObject === null)).toBe(true);
  await expect(preview).not.toHaveAttribute("data-painted");
  await sheet.getByRole("button", { name: "知道了" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.srcObject !== null)).toBe(true);
  await expect(preview).toHaveAttribute("data-painted", "true");
  // 模型用不了：给出回键盘录入的出口
  await sheet.getByRole("button", { name: "返回键盘录入" }).click();
  await expect(sheet).toHaveCount(0);
  await dialog.getByTestId("recognize-button").click();
  await sheet.getByRole("button", { name: "关闭取景" }).click();
  await expect(dialog.getByTestId("hand-area").getByRole("button")).toHaveCount(0);
  await expect(dialog.getByTestId("recognize-button")).toBeEnabled();
});

test("相机不可用 → 取景页仍能打开：说明原因、不出快门、给相册入口与摆牌示意", async ({
  browser,
}) => {
  const { phone: p, dialog } = await openRonHandTab(browser, async (page) => {
    await withDetector()(page);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true }),
    );
  });

  await dialog.getByTestId("recognize-button").click();
  const sheet = p.getByTestId("camera-sheet");
  await expect(sheet.getByText(/当前环境无法使用相机/)).toBeVisible();
  // 快门不能点就不出现
  await expect(sheet.getByTestId("camera-shutter")).toHaveCount(0);
  await expect(sheet.getByLabel("从相册选一张")).toBeVisible();
  await expect(sheet.getByText("拍下的牌面照片会用来改进识别")).toBeVisible();
  await sheet.getByRole("button", { name: "怎么摆" }).click();
  await expect(sheet.getByText("手牌连成一排", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "知道了" }).click();

  // 相册选一张：不用框选，自己在整张照片里找到手牌，定格回填牌面
  // 用一张 4032×3024 的噪点大图（JPEG 编码后远超 2 MB）：送识别前必须缩小，否则留存上传 413
  const big = await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 4032;
    c.height = 3024;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 255) | 0;
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.95).split(",")[1]!;
  });
  const uploaded = p.waitForResponse(
    (r) => r.url().includes("/api/recognitions?") && r.request().method() === "POST",
  );
  await sheet.getByTestId("camera-album").setInputFiles({
    name: "big.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(big, "base64"),
  });
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  await expect(dialog.getByTestId("hand-confirm")).toBeVisible();
  expect((await uploaded).status()).toBe(201);
  await expect(p.getByText("照片留存失败，不影响结算")).toHaveCount(0);
});

test("确认态：点牌替换、改和张、改牌展开全键盘后不再自动收回", async ({ browser }) => {
  const { phone: p, dialog } = await openRonHandTab(browser, withDetector());
  await shoot(p, dialog);

  const confirm = dialog.getByTestId("hand-confirm");
  await expect(confirm).toBeVisible();
  await expect(dialog.getByText("2 番 30 符")).toBeVisible();

  // 点带记号的那张 → 替换面板；换成 5筒 后番符重算（少了赤宝牌 1 番）
  await confirm.getByRole("button", { name: "赤5筒" }).click();
  const sheet = p.getByRole("dialog").filter({ hasText: "换掉 赤5筒" });
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("replace-grid").getByRole("button", { name: "5筒", exact: true }).click();
  await expect(dialog.getByText("1 番 30 符")).toBeVisible();
  // 换过之后这张不再带记号
  await expect(confirm.getByRole("button", { name: "5筒", exact: true })).not.toHaveAttribute(
    "data-mark",
  );

  // 点非和张的牌能改和张
  await confirm.getByRole("button", { name: "1萬" }).click();
  await p
    .getByRole("dialog")
    .filter({ hasText: "换掉 1萬" })
    .getByRole("button", { name: "把这张设为和张" })
    .click();
  await expect(dialog.getByText(/^\d+ 番 \d+ 符$/)).toBeVisible();

  // 改牌 → 全键盘；牌面仍然完整，但不会自己收回确认态
  await confirm.getByRole("button", { name: "改牌" }).click();
  await expect(dialog.getByTestId("tile-keyboard")).toBeVisible();
  await expect(dialog.getByTestId("hand-confirm")).toHaveCount(0);
});

test("算点数页：设场况 → 拍 → 重新拍 → 识别正确出番符点数 → 改自摸重算 → 继续拍", async ({
  browser,
}) => {
  const patches: Record<string, unknown>[] = [];
  const ctx = await newContext(browser, { viewport: { width: 400, height: 800 } });
  const p = await ctx.newPage();
  await withDetector(patches)(p);
  const posts: string[] = [];
  p.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/recognitions/.test(r.url())) posts.push(r.url());
  });

  await p.goto("/?stay=1");
  await p.getByRole("link", { name: /拍照算点数/ }).click();
  await expect(p.getByRole("heading", { name: "拍照算点数" })).toBeVisible();
  await expect(p).toHaveURL(/\/calc$/);

  // 闲家（自风南）、1 本场
  await p.getByRole("button", { name: "南", exact: true }).nth(1).click();
  await p.getByRole("button", { name: "本场加一" }).click();
  await expect(p.getByTestId("calc-honba")).toHaveText("1");

  await p.getByRole("button", { name: /开始拍/ }).click();
  const sheet = p.getByTestId("camera-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("拍下的牌面照片会用来改进识别")).toBeVisible();
  // 相册入口在算点数页常驻（房间里就地拍一张的成本已经接近零）
  await expect(p.getByTestId("camera-album")).toBeAttached();
  // 算点数页才画检测框；每个框贴一张同款牌图当标签。框一出现基本就到第三帧了，
  // 所以这里用「要么看到框、要么已经定格」来判，避免和自动定格抢时序
  await expect
    .poll(
      async () =>
        (await sheet.count()) === 0 ||
        (await sheet.getByRole("button", { name: /^0p \d+%$/ }).count()) > 0,
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });

  // 照片以 source=calc 上传；识别情况 = 带框定格照 + 可改的牌面
  await expect.poll(() => posts.some((u) => u.includes("source=calc"))).toBe(true);
  await expect(p.getByTestId("hand-confirm")).toBeVisible();

  // 定格帧连同烧进去的检测框一起回看：点开是灯箱，可以下载存档
  const shot = p.getByTestId("annotated-shot");
  await expect(shot).toBeVisible();
  await shot.click();
  const lightbox = p.getByTestId("annotated-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(lightbox.getByTestId("annotated-download")).toHaveAttribute("download", /\.jpg$/);
  const download = p.waitForEvent("download");
  await lightbox.getByTestId("annotated-download").click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
  await lightbox.getByRole("button", { name: "关闭" }).click();
  await expect(lightbox).toHaveCount(0);

  // 重新拍：再定格一次，仍停在核对
  await p.getByRole("button", { name: "重新拍" }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  await expect(p.getByTestId("hand-confirm")).toBeVisible();

  // 识别正确：平和 + 赤 = 2 番 30 符，闲家荣和 2000 + 本场 300
  await p.getByTestId("calc-confirm").click();
  const result = p.getByTestId("calc-result");
  await expect(result.getByText("2 番 30 符")).toBeVisible();
  await expect(p.getByTestId("calc-points")).toContainText("2300 点");
  await expect(p.getByTestId("calc-points")).toContainText("含本场 300");
  await expect.poll(() => patches.some((x) => "corrected" in x)).toBe(true);
  expect((patches.find((x) => "corrected" in x)!.corrected as { closed: number[] }).closed).toEqual(
    CLOSED,
  );

  // 结果页改成自摸：门清自摸 + 平和 + 赤 = 3 番 20 符，700/1300 各加本场 100
  await p.getByRole("button", { name: "自摸", exact: true }).click();
  await expect(result.getByText("3 番 20 符")).toBeVisible();
  await expect(p.getByTestId("calc-points")).toContainText("800 / 1400 点");

  // 继续拍：直接回到取景，上一张的标注图跟着清掉；荣和/自摸保留
  await p.getByTestId("calc-next").click();
  await expect(p.getByTestId("camera-sheet")).toBeVisible();
  await expect(p.getByTestId("annotated-shot")).toHaveCount(0);
  await expect(p.getByRole("button", { name: "自摸", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
