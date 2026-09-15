import { expect, test, type Browser, type Page } from "@playwright/test";

/** 每台"手机"用独立的浏览器上下文，拥有各自的设备 token。 */
async function phone(browser: Browser, code: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByText("选择座位")).toBeVisible();
  return page;
}

test("主控台建房 → 四人扫码入座 → 开局 → 手机结算同步电视 → 镜像 → 撤销", async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  const NAMES = ["东家", "南家", "西家", "北家"];
  const phones: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await phone(browser, code);
    const nameInput = p.getByLabel("昵称");
    await nameInput.fill(NAMES[i]!);
    await nameInput.press("Enter");
    await p.getByTestId(`seat-${i}`).click();
    await expect(p.getByTestId(`seat-${i}`)).toContainText(NAMES[i]!);
    await expect(p.getByRole("button", { name: "准备", exact: true })).toBeVisible();
    await p.getByRole("button", { name: "准备", exact: true }).click();
    await expect(p.getByRole("button", { name: "取消准备" })).toBeVisible();
    phones.push(p);
  }
  await expect(tv.getByText("已准备")).toHaveCount(4);

  await tv.getByRole("button", { name: "开局", exact: true }).click();
  await expect(tv.getByTestId("points-0")).toHaveText("25,000");
  await expect(phones[0]!.getByTestId("points-0")).toHaveText("25,000");

  // 手机 0（庄家）自摸 3 番 30 符 → 2000 all
  await phones[0]!.getByRole("button", { name: "自摸", exact: true }).click();
  const dialog = phones[0]!.getByRole("dialog");
  await expect(dialog.getByText("自摸结算")).toBeVisible();
  await dialog.getByRole("button", { name: "3", exact: true }).click();
  await dialog.getByRole("button", { name: "30", exact: true }).click();
  await expect(tv.getByText("正在录入自摸结算")).toBeVisible();
  await dialog.getByRole("button", { name: "确认自摸" }).click();
  await expect(tv.getByTestId("points-0")).toHaveText("31,000");
  await expect(tv.getByTestId("points-1")).toHaveText("23,000");
  await expect(phones[2]!.getByTestId("points-0")).toHaveText("31,000");
  await expect(tv.getByText("东1局1本场")).toBeVisible();
  await expect(tv.getByText("正在录入自摸结算")).toHaveCount(0);

  // 番符表镜像
  await phones[1]!.getByRole("button", { name: "番符表" }).click();
  await expect(tv.getByText("正在查看番符表")).toBeVisible();
  await phones[1]!.getByRole("button", { name: "关闭" }).first().click();
  await expect(tv.getByText("正在查看番符表")).toHaveCount(0);

  // 主控台自身撤销
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("button", { name: "撤销" }).click();
  await expect(tv.getByTestId("points-0")).toHaveText("25,000");
  await expect(phones[3]!.getByTestId("points-0")).toHaveText("25,000");
  await tv.keyboard.press("Escape");

  // 牌面形态：手机 2 荣和手机 3，平和 1 番 30 符 = 1000
  await phones[2]!.getByRole("button", { name: "荣和", exact: true }).click();
  const ron = phones[2]!.getByRole("dialog");
  await ron.getByRole("combobox").first().click();
  await phones[2]!.getByRole("option", { name: "北家" }).click();
  await ron.getByRole("tab", { name: "牌面" }).click();
  const keyboard = ron.getByTestId("tile-keyboard");
  // 闭牌（可点击 button）与副露（不可点击 span）底边对齐
  await ron.getByRole("button", { name: "碰", exact: true }).click();
  await keyboard.getByRole("button", { name: "1索", exact: true }).click();
  await keyboard.getByRole("button", { name: "2萬", exact: true }).click();
  const handArea = ron.getByTestId("hand-area");
  const closedBox = (await handArea.getByRole("button", { name: "2萬" }).boundingBox())!;
  const meldBox = (await handArea.getByRole("img", { name: "1索" }).first().boundingBox())!;
  expect(Math.abs(closedBox.y + closedBox.height - (meldBox.y + meldBox.height))).toBeLessThan(1);
  expect(Math.abs(closedBox.height - meldBox.height)).toBeLessThan(1);
  await handArea.getByRole("button", { name: "删除副露" }).click();
  await ron.getByRole("button", { name: "清空" }).click();
  // 123m 4筒 赤5筒 6筒 789s 789m 22p（和张 9m）：平和 + 赤宝牌 = 2 番 30 符 → 2000
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
  await expect(ron.getByText("2 番 30 符")).toBeVisible();
  await expect(ron.getByText("赤宝牌 1 番")).toBeVisible();
  // 电视全屏镜像：和牌者、牌面、番符、役种
  await expect(tv.getByText("正在录入荣和结算")).toBeVisible();
  await expect(tv.getByText("2 番 30 符", { exact: true })).toBeVisible();
  await expect(tv.getByRole("img", { name: "赤5筒" })).toBeVisible();
  await expect(tv.getByText("赤宝牌 1 番")).toBeVisible();
  await ron.getByRole("button", { name: "确认荣和" }).click();
  await expect(tv.getByText("正在录入荣和结算")).toHaveCount(0);
  await expect(tv.getByTestId("points-2")).toHaveText("27,000");
  await expect(tv.getByTestId("points-3")).toHaveText("23,000");
  await expect(
    tv.getByText("闲家 西家 荣和 北家 2 番 30 符，共 2,000 点，共收入 2,000 点。"),
  ).toBeVisible();
  // 历史记录展示牌面：和张 9萬 单独标出，赤5筒 出现在手牌里，役种 chips
  const historyTable = tv.getByRole("listitem").filter({ hasText: "西家 荣和 北家" });
  await expect(historyTable.getByRole("img", { name: "赤5筒" })).toBeVisible();
  await expect(historyTable.getByText("平和 1 番")).toBeVisible();

  await tvCtx.close();
});

test("主控台添加本地玩家（免手机）+ 两台手机 → 开局；手机可让本地玩家离座", async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console"); // 新的浏览器上下文没有保存的房间码，会自动新建房间
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";

  // 东家：新建并入座；南家：再建一个
  for (const [seat, name] of [
    [0, "本地甲"],
    [1, "本地乙"],
  ] as const) {
    await tv.getByTestId(`seat-${seat}`).getByRole("button", { name: "添加本地玩家" }).click();
    const dlg = tv.getByRole("dialog");
    await dlg.getByLabel("新建本地玩家").fill(name);
    await dlg.getByRole("button", { name: "创建并入座" }).click();
    await expect(tv.getByTestId(`seat-${seat}`)).toContainText(name);
    await expect(tv.getByTestId(`seat-${seat}`)).toContainText("已准备");
    await expect(tv.getByTestId(`seat-${seat}`)).toContainText("本地");
  }

  const phones: Page[] = [];
  for (const i of [2, 3]) {
    const p = await phone(browser, code);
    await p.getByTestId(`seat-${i}`).click();
    await p.getByRole("button", { name: "准备", exact: true }).click();
    await expect(p.getByRole("button", { name: "取消准备" })).toBeVisible();
    phones.push(p);
  }
  await expect(tv.getByText("已准备")).toHaveCount(4);
  // 手机点自己的座位卡即离座，再点回去
  await expect(phones[1]!.getByTestId("seat-3")).toHaveAccessibleName(/离座$/);
  await phones[1]!.getByTestId("seat-3").click();
  await expect(phones[1]!.getByTestId("seat-3")).toHaveAccessibleName("点击入座");
  await phones[1]!.getByTestId("seat-3").click();
  await phones[1]!.getByRole("button", { name: "准备", exact: true }).click();
  await expect(tv.getByText("已准备")).toHaveCount(4);
  // 手机端也能看到本地玩家已入座，并可让其离座（人人管理员）
  await expect(phones[0]!.getByTestId("seat-0")).toContainText("本地甲");
  await tv.getByTestId("seat-1").getByRole("button", { name: "本地乙 离座" }).click();
  await expect(tv.getByTestId("seat-1")).toContainText("等待加入");
  // 从已有列表再次入座
  await tv.getByTestId("seat-1").getByRole("button", { name: "添加本地玩家" }).click();
  await tv
    .getByRole("dialog")
    .getByRole("listitem")
    .filter({ has: tv.getByRole("button", { name: "删除 本地乙" }) })
    .getByRole("button", { name: "入座" })
    .click();
  await expect(tv.getByTestId("seat-1")).toContainText("本地乙");

  await tv.getByRole("button", { name: "开局", exact: true }).click();
  await expect(tv.getByTestId("points-0")).toHaveText("25,000");
  await expect(phones[1]!.getByTestId("points-1")).toHaveText("25,000");

  // 对局中解散（入口在「操作」对话框）：手机看到提示，主控台自动开新房，且没有错误提示
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("button", { name: "解散房间" }).click();
  await tv.getByRole("button", { name: "解散", exact: true }).click();
  await expect(phones[0]!.getByText(`房间 ${code} 已解散`)).toBeVisible();
  await expect(tv.getByTestId("room-code")).toBeVisible();
  expect((await tv.getByTestId("room-code").textContent())?.trim()).not.toBe(code);
  await expect(tv.getByText("操作失败")).toHaveCount(0);
  await expect(tv.getByText("连接已断开")).toHaveCount(0);
  await tvCtx.close();
});
