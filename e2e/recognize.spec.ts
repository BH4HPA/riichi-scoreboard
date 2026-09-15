import path from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const FIXTURE = path.join(import.meta.dirname, "fixtures/hand.jpg");

/** 123m 4筒 赤5筒 6筒 789s 789m 22p，和张 9m：平和 + 赤宝牌 = 2 番 30 符 */
const HAND = {
  closed: [1, 2, 3, 13, 36, 15, 25, 26, 27, 7, 8, 11, 11, 9],
  melds: [],
  winTile: 9,
  doraIndicators: [],
  uraIndicators: [],
};

const SERVER_RESULT = {
  id: "rec-e2e",
  result: {
    engine: "server",
    modelId: "e2e",
    ms: 321,
    detections: [],
    hand: HAND,
    warnings: [{ code: "low_conf", message: "1 张牌置信度较低，请核对" }],
  },
};

async function phone(browser: Browser, code: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByTestId("seat-0")).toBeVisible();
  return page;
}

/** 开房、四台手机入座准备、自动开局，返回手机 2 已打开的荣和对话框（放铳者北家、牌面页）。 */
async function openRonHandTab(browser: Browser): Promise<{ phone: Page; dialog: Locator }> {
  const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  const NAMES = ["东家", "南家", "西家", "北家"];
  const phones: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await phone(browser, code);
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

test("服务器引擎：拍照 → 裁剪 → 识别结果填入牌面并自动算番 → 结算后回填真值", async ({
  browser,
}) => {
  const { phone: p, dialog } = await openRonHandTab(browser);
  await p.route("**/api/recognitions?infer=1", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(SERVER_RESULT),
    }),
  );
  const patches: unknown[] = [];
  await p.route("**/api/recognitions/rec-e2e", async (route) => {
    patches.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });

  await dialog.getByRole("button", { name: "服务器识别" }).click();
  await dialog.getByTestId("recognize-file").setInputFiles(FIXTURE);
  const cropDialog = p.getByRole("dialog").filter({ hasText: "裁剪照片" });
  await expect(cropDialog).toBeVisible();
  const confirmCrop = cropDialog.getByRole("button", { name: "确认裁剪" });
  await expect(confirmCrop).toBeEnabled();
  await confirmCrop.click();

  await expect(dialog.getByTestId("recognize-status")).toHaveText("服务器识别 · 321 ms");
  await expect(dialog.getByText("1 张牌置信度较低，请核对")).toBeVisible();
  const handArea = dialog.getByTestId("hand-area");
  await expect(handArea.getByRole("button", { name: "赤5筒" })).toBeVisible();
  await expect(dialog.getByText("2 番 30 符")).toBeVisible();
  await expect(dialog.getByText("赤宝牌 1 番")).toBeVisible();

  await dialog.getByRole("button", { name: "确认荣和" }).click();
  await expect(p.getByTestId("points-2")).toHaveText("27,000");
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  const corrected = (patches[0] as { corrected: { closed: number[]; winTile: number } }).corrected;
  expect(corrected.closed).toEqual(HAND.closed);
  expect(corrected.winTile).toBe(9);
});

test("本机引擎：模型加载失败 → 错误提示、牌面不变，照片仍已上传", async ({ browser }) => {
  const { phone: p, dialog } = await openRonHandTab(browser);
  await p.route("**/riichi/models/*.onnx", (route) => route.abort());
  const uploaded = p.waitForRequest(
    (req) => req.method() === "POST" && /\/api\/recognitions$/.test(req.url()),
  );

  await dialog.getByTestId("recognize-file").setInputFiles(FIXTURE);
  const cropDialog = p.getByRole("dialog").filter({ hasText: "裁剪照片" });
  const confirmCrop = cropDialog.getByRole("button", { name: "确认裁剪" });
  await expect(confirmCrop).toBeEnabled();
  await confirmCrop.click();

  await expect(p.getByText(/^识别失败：/)).toBeVisible({ timeout: 20_000 });
  await uploaded;
  await expect(dialog.getByTestId("hand-area").getByRole("button")).toHaveCount(0);
  await expect(dialog.getByTestId("recognize-button")).toBeEnabled();
});
