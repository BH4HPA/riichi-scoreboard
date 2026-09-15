import { test, type Browser, type Page } from "@playwright/test";

/** 视觉检查用截图脚本：`SHOTS_DIR=/tmp/riichi-shots yarn e2e e2e/shots.spec.ts`；默认不跑。 */
const OUT = process.env.SHOTS_DIR;
test.skip(!OUT, "仅在设置 SHOTS_DIR 时运行");

async function phone(browser: Browser, code: string, name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  const nameInput = page.getByLabel("昵称");
  await nameInput.fill(name);
  await nameInput.press("Enter");
  return page;
}

test("截图：番符表与主控台", async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  await tv.screenshot({ path: `${OUT}/tv-lobby.png` });
  const phones: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await phone(browser, code, ["Ray", "小明", "阿花", "老王"][i]!);
    await p.getByTestId(`seat-${i}`).getByRole("button", { name: "点击入座" }).click();
    await p.getByRole("button", { name: "准备", exact: true }).click();
    phones.push(p);
  }
  await tv.getByRole("button", { name: "开局", exact: true }).click();
  await tv.getByTestId("points-0").waitFor();

  // 手机 2 牌面荣和
  await phones[2]!.getByRole("button", { name: "荣和", exact: true }).click();
  const ron = phones[2]!.getByRole("dialog");
  await ron.getByRole("combobox").first().click();
  await phones[2]!.getByRole("option", { name: "老王" }).click();
  await ron.getByRole("tab", { name: "牌面" }).click();
  const keyboard = ron.getByTestId("tile-keyboard");
  for (const t of [
    "1萬",
    "2萬",
    "3萬",
    "4筒",
    "赤5筒",
    "6筒",
    "7索",
    "8索",
    "9索",
    "7萬",
    "8萬",
    "2筒",
    "2筒",
    "9萬",
  ]) {
    await keyboard.getByRole("button", { name: t, exact: true }).click();
  }
  await ron.getByText("2 番 30 符").waitFor();
  await phones[2]!.screenshot({ path: `${OUT}/phone-ron-keyboard.png`, fullPage: true });
  await ron.getByRole("button", { name: "确认荣和" }).click();
  await tv.getByTestId("points-2").filter({ hasText: "27,000" }).waitFor();
  await tv.screenshot({ path: `${OUT}/tv-game.png` });

  // 番符表：手机打开，电视镜像
  await phones[1]!.getByRole("button", { name: "番符表" }).click();
  await tv.getByText("正在查看番符表").waitFor();
  await tv.screenshot({ path: `${OUT}/tv-ref-yaku.png` });
  await phones[1]!.screenshot({ path: `${OUT}/phone-ref-yaku.png` });
  const dlg = phones[1]!.getByRole("dialog");
  await dlg.getByRole("tab", { name: "役满", exact: true }).click();
  await tv.getByText("国士无双").first().waitFor();
  await tv.waitForTimeout(500);
  await tv.screenshot({ path: `${OUT}/tv-ref-yakuman.png` });
  await phones[1]!.screenshot({ path: `${OUT}/phone-ref-yakuman.png` });
  await dlg.getByRole("tab", { name: "点数计算" }).click();
  await tv.getByText("闲家点数表").waitFor();
  await tv.waitForTimeout(300);
  await tv.screenshot({ path: `${OUT}/tv-ref-points-ko.png` });
  await phones[1]!.screenshot({ path: `${OUT}/phone-ref-points.png` });
  await dlg.getByRole("tab", { name: "庄家点数表" }).click();
  await tv.waitForTimeout(300);
  await tv.screenshot({ path: `${OUT}/tv-ref-points-oya.png` });
  await dlg.getByRole("tab", { name: "符数计算表" }).click();
  await tv.waitForTimeout(300);
  await tv.screenshot({ path: `${OUT}/tv-ref-fu.png` });
  await phones[1]!.screenshot({ path: `${OUT}/phone-ref-fu.png`, fullPage: true });
  await tvCtx.close();
});
