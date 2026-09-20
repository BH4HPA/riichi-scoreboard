import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { newContext } from "./helpers";

/** 每台"手机"用独立的浏览器上下文，拥有各自的设备 token。 */
async function phone(browser: Browser, code: string, name: string, seat: number): Promise<Page> {
  const ctx = await newContext(browser, { viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByTestId("seat-0")).toBeVisible();
  // 二人房只有两个座位
  await expect(page.getByTestId("seat-2")).toHaveCount(0);
  const nameInput = page.getByLabel("昵称");
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await page.getByTestId(`seat-${seat}`).click();
  await expect(page.getByTestId(`seat-${seat}`)).toContainText(name);
  return page;
}

test("二人房：首页选房型 → 投屏规则说明 → 宣言 → 全牌型板 → 自摸和镜像 → 流局 → 撤销 → B 阶段终局", async ({
  browser,
}) => {
  const tvCtx = await newContext(browser, {
    ...devices["Desktop Chrome"],
    viewport: { width: 1600, height: 900 },
  });
  const tv = await tvCtx.newPage();
  await tv.goto("/");
  await tv.getByTestId("open-ten").click();
  const code = (await tv.getByTestId("room-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  // 二人房的规则卡只有它消费的两节
  await expect(tv.getByRole("heading", { name: "点数换算" })).toBeVisible();
  await expect(tv.getByRole("heading", { name: "终局" })).toHaveCount(0);

  const east = await phone(browser, code, "阿东", 0);
  const west = await phone(browser, code, "阿西", 1);

  // ── 大厅：规则说明投到电视，电视跟着讲解者翻页；关掉弹层即消失 ──
  await east.getByRole("button", { name: "规则说明" }).click();
  const guide = east.getByRole("dialog");
  await expect(guide.getByTestId("ten-guide")).toContainText("两个人打，比的是谁的听牌更难猜");
  await expect(tv.getByTestId("ten-guide-mirror")).toHaveCount(0);
  await guide.getByRole("switch", { name: "投到电视" }).click();
  await expect(tv.getByTestId("ten-guide-mirror")).toContainText("阿东");
  await expect(tv.getByTestId("ten-guide-mirror")).toContainText("比的是谁的听牌更难猜");
  await guide.getByRole("tab", { name: "3" }).click();
  await expect(tv.getByTestId("ten-guide-mirror")).toContainText("防守方每轮猜 2 张");
  await east.keyboard.press("Escape");
  await expect(tv.getByTestId("ten-guide-mirror")).toHaveCount(0);
  // 手机大厅的规则弹窗里不再有投屏开关（电视大厅本就常驻规则表，那个开关没有效果）
  await east.getByRole("button", { name: "修改规则" }).click();
  await expect(east.getByRole("dialog").getByRole("switch", { name: "投到电视" })).toHaveCount(0);
  await east.keyboard.press("Escape");

  // ── 两人准备 → 自动开局 ──
  for (const p of [east, west]) {
    await p.getByRole("button", { name: "准备", exact: true }).click();
  }
  await expect(tv.getByTestId("score-0")).toHaveText("0");
  await expect(tv.getByTestId("sticks-0")).toHaveText("立直棒 10");
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage A · 比谁先听牌");
  await expect(tv.getByTestId("guess-board")).toHaveCount(0);

  // Stage A 没有和牌入口（不是灰着，是不出现）
  await expect(east.getByRole("button", { name: "自摸和" })).toHaveCount(0);
  await expect(east.getByRole("button", { name: "无人宣言流局" })).toBeVisible();

  // ── 阿东立直：扣 1 根立直棒、电视放曲、进入 Stage B，右栏从历史换成全牌型板 ──
  await east.getByRole("button", { name: "立直", exact: true }).click();
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage B · 阿东 立直");
  await expect(tv.getByTestId("sticks-0")).toHaveText("立直棒 9");
  await expect(tv.getByTestId("music-float")).toBeVisible();
  const board = tv.getByTestId("guess-board");
  await expect(board).toContainText("第 1 轮指定");
  await expect(tv.getByText("暂无记录")).toHaveCount(0);
  // 进攻方的手机只读；防守方的手机可以点
  await expect(east.getByRole("button", { name: "指定这两张" })).toHaveCount(0);
  await expect(east.getByTestId("guess-board")).toContainText("由防守方在手机上指定");
  const pick = west.getByTestId("guess-tiles");
  await expect(west.getByRole("button", { name: "指定这两张" })).toBeDisabled();
  await pick.getByRole("button", { name: "1萬" }).click();
  await pick.getByRole("button", { name: "9萬" }).click();
  await west.getByRole("button", { name: "指定这两张" }).click();
  // 电视：刚指定的两张带角标、保持明亮
  const tvTiles = tv.getByTestId("guess-tiles");
  await expect(board).toContainText("第 2 轮指定");
  await expect(tvTiles.getByLabel("1萬")).toHaveAttribute("data-mark", "true");
  await expect(tvTiles.getByLabel("1萬")).not.toHaveClass(/opacity-35/);
  // 防守方自己的手机上，指定过的不能再点
  await expect(pick.getByRole("button", { name: "1萬" })).toBeDisabled();
  await pick.getByRole("button", { name: "東" }).click();
  await pick.getByRole("button", { name: "白" }).click();
  await west.getByRole("button", { name: "指定这两张" }).click();
  // 下一轮指定后，上一轮的两张变暗
  await expect(tvTiles.getByLabel("1萬")).toHaveClass(/opacity-35/);
  await expect(tvTiles.getByLabel("9萬")).toHaveClass(/opacity-35/);
  await expect(tvTiles.getByLabel("東")).toHaveAttribute("data-mark", "true");
  await expect(tvTiles.getByLabel("5筒")).not.toHaveClass(/opacity-35/);

  // ── 自摸和：和牌者就是进攻方，不用选人；电视全屏镜像；立直开关锁住 ──
  await east.getByRole("button", { name: "自摸和" }).click();
  await expect(tv.getByTestId("music-float")).toHaveCount(0);
  const dialog = east.getByRole("dialog");
  await expect(dialog.getByText("自摸和 · 阿东（立直）")).toBeVisible();
  await expect(tv.getByTestId("ten-settlement-mirror")).toContainText("正在录入自摸和");
  await dialog.getByRole("tab", { name: "牌面" }).click();
  await expect(dialog.getByRole("checkbox", { name: "立直", exact: true })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "立直", exact: true })).toBeDisabled();
  await expect(dialog.getByText("本局是立直宣言：立直已勾上，不能取消。")).toBeVisible();
  await dialog.getByRole("tab", { name: "番符" }).click();
  await dialog.getByRole("button", { name: "3", exact: true }).click();
  await dialog.getByRole("button", { name: "30", exact: true }).click();
  // 庄家 3 番 30 符自摸 2000 all → 6000，只加给自己
  await expect(dialog.getByTestId("settlement-summary")).toHaveText(
    "阿东（立直）自摸 3 番 30 符，得 6,000 点；对手不扣分",
  );
  await expect(tv.getByTestId("ten-settlement-mirror")).toContainText("+6,000");
  await dialog.getByRole("button", { name: "确认自摸和" }).click();
  await expect(tv.getByTestId("ten-settlement-mirror")).toHaveCount(0);
  await expect(tv.getByTestId("score-0")).toHaveText("6,000");
  await expect(tv.getByTestId("score-1")).toHaveText("0");
  // 记完一局：回到 Stage A，右栏换回历史
  await expect(tv.getByTestId("guess-board")).toHaveCount(0);
  await expect(
    tv.getByText(/阿东 立直后，防守方指定 2 轮未中，自摸 3 番 30 符，得 6,000 点/),
  ).toBeVisible();
  await expect(tv.getByRole("heading", { name: "第 2 局 1 本场" })).toBeVisible();

  // ── 阿西听牌宣言（不扣立直棒）→ 阿东猜中 → 流局 ──
  await west.getByRole("button", { name: "听牌宣言" }).click();
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage B · 阿西 听牌宣言");
  await expect(tv.getByTestId("sticks-1")).toHaveText("立直棒 10");
  const eastPick = east.getByTestId("guess-tiles");
  await eastPick.getByRole("button", { name: "2索" }).click();
  await eastPick.getByRole("button", { name: "5索" }).click();
  await east.getByRole("button", { name: "指定这两张" }).click();
  await east.getByRole("button", { name: "被猜中" }).click();
  await expect(east.getByRole("dialog")).toContainText(
    "防守方第 1 轮猜中了 阿西（听牌宣言）的待牌",
  );
  await expect(tv.getByTestId("ten-settlement-mirror")).toContainText("被猜中流局");
  await east.getByRole("button", { name: "确认流局" }).click();
  await expect(tv.getByRole("heading", { name: "第 3 局 2 本场" })).toBeVisible();
  await expect(tv.getByTestId("score-0")).toHaveText("6,000");

  // ── 主控台撤销：回到 Stage B，提示写明撤的是哪一步 ──
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("dialog").getByRole("button", { name: "撤销" }).click();
  await expect(tv.getByText(/撤销了：第 2 局 1 本场 被猜中流局/)).toBeVisible();
  await tv.keyboard.press("Escape");
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage B · 阿西 听牌宣言");
  await expect(tv.getByTestId("guess-tiles").getByLabel("2索")).toHaveAttribute(
    "data-mark",
    "true",
  );

  // ── Stage B 中途终局：写明这一局不计入；终局后右栏回到历史；撤销终局回到 B ──
  await west.getByRole("button", { name: "终局", exact: true }).click();
  await expect(west.getByRole("dialog")).toContainText("这一局还没有记结果");
  await west.getByRole("button", { name: "确认终局" }).click();
  await expect(tv.getByTestId("ten-final")).toContainText("阿东 获胜");
  await expect(tv.getByTestId("guess-board")).toHaveCount(0);
  await expect(west.getByTestId("guess-board")).toHaveCount(0);
  await west.getByRole("button", { name: "撤销" }).click();
  await expect(tv.getByTestId("ten-final")).toHaveCount(0);
  await expect(tv.getByTestId("guess-board")).toBeVisible();

  // ── 对局中的「规则」页：规则说明可投到电视，关掉即消失 ──
  await east
    .getByRole("navigation", { name: "功能" })
    .getByRole("button", { name: "规则" })
    .click();
  await east.getByRole("dialog").getByRole("switch", { name: "投到电视" }).click();
  await expect(tv.getByTestId("ten-guide-mirror")).toBeVisible();
  await east.keyboard.press("Escape");
  await expect(tv.getByTestId("ten-guide-mirror")).toHaveCount(0);

  await tvCtx.close();
});
