import path from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { newContext } from "./helpers";

const FIXTURE = path.join(import.meta.dirname, "fixtures/hand.jpg");
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

test("拍照 → 裁剪 → 本机推理填入牌面并自动算番 → 检测框与结算后的真值都回填", async ({
  browser,
}) => {
  const patches: Record<string, unknown>[] = [];
  const { phone: p, dialog } = await openRonHandTab(browser, async (page) => {
    // 进房间时预热的就是这个假模型（真模型在 CDN，测试不碰网络）
    await page.route("**/riichi/models/*.onnx", (route) =>
      route.fulfill({ path: DETECTOR, contentType: "application/octet-stream" }),
    );
    await page.route("**/api/recognitions/*", async (route) => {
      patches.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 204 });
    });
  });

  await dialog.getByTestId("recognize-file").setInputFiles(FIXTURE);
  const cropDialog = p.getByRole("dialog").filter({ hasText: "裁剪照片" });
  await expect(cropDialog).toBeVisible();
  const confirmCrop = cropDialog.getByRole("button", { name: "确认裁剪" });
  await expect(confirmCrop).toBeEnabled();
  await confirmCrop.click();

  await expect(dialog.getByTestId("recognize-status")).toHaveText(/^识别完成 · \d+ ms$/, {
    timeout: 30_000,
  });
  await expect(dialog.getByText("1 张牌置信度较低，请核对")).toBeVisible();
  const handArea = dialog.getByTestId("hand-area");
  await expect(handArea.getByRole("button", { name: "赤5筒" })).toBeVisible();
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

test("模型加载失败 → 错误提示、牌面不变，照片仍已上传", async ({ browser }) => {
  const { phone: p, dialog } = await openRonHandTab(browser, (page) =>
    page.route("**/riichi/models/*.onnx", (route) => route.abort()),
  );
  const uploaded = p.waitForRequest(
    (req) => req.method() === "POST" && /\/api\/recognitions$/.test(req.url()),
  );

  await dialog.getByTestId("recognize-file").setInputFiles(FIXTURE);
  const cropDialog = p.getByRole("dialog").filter({ hasText: "裁剪照片" });
  const confirmCrop = cropDialog.getByRole("button", { name: "确认裁剪" });
  await expect(confirmCrop).toBeEnabled();
  await confirmCrop.click();

  // 模型下载被拦掉时才会走到这里：说明本地的 wasm 运行时已加载成功
  await expect(p.getByText(/^识别失败：.*fetch/i)).toBeVisible({ timeout: 20_000 });
  await uploaded;
  await expect(dialog.getByTestId("hand-area").getByRole("button")).toHaveCount(0);
  await expect(dialog.getByTestId("recognize-button")).toBeEnabled();
});
