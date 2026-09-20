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

test("二人房：首页选房型 → 投屏规则说明 → 宣言 → 全牌型板 → 自摸镜像 → 流局 → 撤销 → B 阶段终局 → 重开", async ({
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

  // ── 大厅：规则说明投到电视。手机上五节竖着平铺，读到哪一节电视就切到哪一节；关掉弹层即消失 ──
  await east.getByRole("button", { name: "规则说明" }).click();
  const guide = east.getByRole("dialog");
  await expect(guide.getByTestId("ten-guide")).toContainText("两个人打，比的是谁的听牌更难猜");
  // 不分页：后面几节也都在（不用点 1–5 的标签）
  await expect(guide.getByTestId("ten-guide")).toContainText("防守方每轮猜 2 张");
  await expect(guide.getByRole("tab")).toHaveCount(0);
  await expect(tv.getByTestId("ten-guide-mirror")).toHaveCount(0);
  await guide.getByRole("switch", { name: "投到电视" }).click();
  await expect(tv.getByTestId("ten-guide-mirror")).toContainText("阿东");
  await expect(tv.getByTestId("ten-guide-mirror")).toContainText("比的是谁的听牌更难猜");
  await guide
    .locator('[data-page="stageB"]')
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(tv.getByTestId("ten-guide-mirror")).toContainText("防守方每轮猜 2 张");
  await expect(tv.getByTestId("ten-guide-mirror")).not.toContainText("比的是谁的听牌更难猜");
  // 最后一节排在末尾、够不着判定带：滚到底就算读到它
  await guide.getByTestId("ten-guide").evaluate((el) => {
    let node = el.parentElement;
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY))
      node = node.parentElement;
    node?.scrollTo(0, node.scrollHeight);
  });
  await expect(tv.getByTestId("ten-guide-mirror")).toContainText("宣言和记结果在手机上点");
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
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage A");
  // 0 本场也写出来
  await expect(tv.getByRole("heading", { name: "第 1 局 0 本场" })).toBeVisible();
  await expect(tv.getByTestId("guess-board")).toHaveCount(0);

  // Stage A 没有和牌入口（不是灰着，是不出现）；结算只有「流局」
  await expect(east.getByRole("button", { name: "自摸", exact: true })).toHaveCount(0);
  await expect(east.getByRole("button", { name: "被猜中" })).toHaveCount(0);
  await expect(east.getByRole("button", { name: "流局", exact: true })).toBeVisible();

  // ── 误点了立直 → 打开自摸才发现 → 对方撤销宣言：弹窗关闭，不会在下次宣言时自己弹回来 ──
  await east.getByRole("button", { name: "立直", exact: true }).click();
  await expect(east.getByTestId("sticks-0")).toHaveText("立直棒 9");
  await east.getByRole("button", { name: "自摸", exact: true }).click();
  await east.getByRole("dialog").getByRole("button", { name: "3", exact: true }).click();
  await west.getByRole("button", { name: "撤销" }).click();
  await expect(east.getByRole("dialog")).toHaveCount(0);
  // 紧跟着到的撤销广播盖过了「局面已变化」：留在屏幕上的这一句正好说明弹窗为什么关了
  await expect(east.getByText(/阿西 撤销了：阿东的立直/)).toBeVisible();
  await expect(tv.getByTestId("sticks-0")).toHaveText("立直棒 10");
  await expect(tv.getByTestId("music-float")).toHaveCount(0);
  // 改按听牌宣言：是另一次宣言，旧草稿（立直、选好的 3 番）不沿用
  await east.getByRole("button", { name: "听牌宣言" }).click();
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage B · 阿东 听牌宣言");
  await expect(east.getByRole("dialog")).toHaveCount(0);
  await east.getByRole("button", { name: "自摸", exact: true }).click();
  const redo = east.getByRole("dialog");
  await expect(redo.getByText("自摸和 · 阿东（听牌宣言）")).toBeVisible();
  await expect(redo.getByRole("button", { name: "3", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await redo.getByRole("tab", { name: "牌面" }).click();
  // 立直由本局的宣言决定：听牌宣言的局不勾、也勾不上
  await expect(redo.getByRole("checkbox", { name: "立直", exact: true })).not.toBeChecked();
  await expect(redo.getByRole("checkbox", { name: "立直", exact: true })).toBeDisabled();
  await redo.getByRole("tab", { name: "番符" }).click();
  await redo.getByRole("button", { name: "取消" }).click();
  await east.getByRole("button", { name: "撤销" }).click();
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage A");

  // ── 阿东立直：扣 1 根立直棒、电视放曲、进入 Stage B，右栏从历史换成全牌型板 ──
  await east.getByRole("button", { name: "立直", exact: true }).click();
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage B · 阿东 立直");
  await expect(tv.getByTestId("sticks-0")).toHaveText("立直棒 9");
  await expect(tv.getByTestId("music-float")).toBeVisible();
  await expect(tv.getByTestId("guess-board")).toBeVisible();
  await expect(tv.getByText("暂无记录")).toHaveCount(0);
  // 进攻方的手机只读；防守方的手机点一下划掉、再点一下恢复——没有轮次、没有确认按钮
  await expect(east.getByTestId("guess-tiles").getByRole("button")).toHaveCount(0);
  const pick = west.getByTestId("guess-tiles");
  await expect(pick.getByRole("button")).toHaveCount(34);
  const tvTiles = tv.getByTestId("guess-tiles");
  // 连点几张，中间不等广播回来：上一下的状态还在路上，下一下带着旧 seq 到达也照样执行，不会丢
  for (const n of ["1萬", "9萬", "東", "白"]) await pick.getByRole("button", { name: n }).click();
  for (const n of ["1萬", "9萬", "東", "白"]) {
    await expect(tvTiles.getByLabel(n)).toHaveAttribute("data-struck", "true");
  }
  await expect(tv.getByTestId("guess-board")).toContainText("已划掉 4 种");
  await expect(tvTiles.getByLabel("5筒")).not.toHaveAttribute("data-struck");
  await expect(pick.getByRole("button", { name: "白" })).toHaveAttribute("aria-pressed", "true");
  await pick.getByRole("button", { name: "白" }).click();
  await expect(tvTiles.getByLabel("白")).not.toHaveAttribute("data-struck");
  await expect(east.getByTestId("guess-tiles").getByLabel("1萬")).toHaveAttribute(
    "data-struck",
    "true",
  );
  // 牌撑满格子：横向间距与纵向间距一致
  const [b1, b2, b10] = await Promise.all(
    ["1萬", "2萬", "1筒"].map(
      async (n) => (await pick.getByRole("button", { name: n }).boundingBox())!,
    ),
  );
  const gapX = b2!.x - (b1!.x + b1!.width);
  const gapY = b10!.y - (b1!.y + b1!.height);
  expect(Math.abs(gapX - gapY)).toBeLessThan(1.5);
  expect(b1!.width).toBeGreaterThan(34);

  // ── 自摸：和牌者就是进攻方，不用选人；电视全屏镜像；立直开关锁住 ──
  await east.getByRole("button", { name: "自摸", exact: true }).click();
  await expect(tv.getByTestId("music-float")).toHaveCount(0);
  const dialog = east.getByRole("dialog");
  await expect(dialog.getByText("自摸和 · 阿东（立直）")).toBeVisible();
  await expect(tv.getByTestId("ten-settlement-mirror")).toContainText("正在录入自摸和");
  // 防守方还在划牌：进攻方的弹窗不会因此被关掉
  await pick.getByRole("button", { name: "2索" }).click();
  await expect(tvTiles.getByLabel("2索")).toHaveAttribute("data-struck", "true");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "牌面" }).click();
  await expect(dialog.getByRole("checkbox", { name: "立直", exact: true })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "立直", exact: true })).toBeDisabled();
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
  // 自己提交的这一笔不该弹「局面已变化」
  await expect(east.getByRole("dialog")).toHaveCount(0);
  await expect(east.getByText("局面已变化，结算已关闭")).toHaveCount(0);
  // 记完一局：回到 Stage A，右栏换回历史
  await expect(tv.getByTestId("guess-board")).toHaveCount(0);
  await expect(tv.getByText(/阿东 立直后自摸 3 番 30 符，得 6,000 点/)).toBeVisible();
  await expect(tv.getByRole("heading", { name: "第 2 局 1 本场" })).toBeVisible();

  // ── 两台手机同时开着 Stage A 的「流局」：一台确认后另一台的确认框自动关掉，不会多记一局 ──
  await east.getByRole("button", { name: "流局", exact: true }).click();
  await west.getByRole("button", { name: "流局", exact: true }).click();
  await expect(east.getByRole("dialog")).toContainText("无人宣言流局");
  await east.getByRole("button", { name: "确认流局" }).click();
  await expect(west.getByRole("dialog")).toHaveCount(0);
  await expect(west.getByText("局面已变化，结算已关闭")).toBeVisible();
  await expect(east.getByText("局面已变化，结算已关闭")).toHaveCount(0);
  await expect(tv.getByRole("heading", { name: "第 3 局 2 本场" })).toBeVisible();
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("dialog").getByRole("button", { name: "撤销" }).click();
  await tv.keyboard.press("Escape");
  await expect(tv.getByRole("heading", { name: "第 2 局 1 本场" })).toBeVisible();

  // ── 阿西听牌宣言（不扣立直棒）→ 被猜中 → 流局 ──
  await west.getByRole("button", { name: "听牌宣言" }).click();
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage B · 阿西 听牌宣言");
  await expect(tv.getByTestId("sticks-1")).toHaveText("立直棒 10");
  // 新的一局：板子是干净的
  await expect(tv.getByTestId("guess-board")).toContainText("已划掉 0 种");
  await east.getByTestId("guess-tiles").getByRole("button", { name: "2索" }).click();
  await east.getByRole("button", { name: "被猜中" }).click();
  await expect(east.getByRole("dialog")).toContainText("防守方猜中了 阿西（听牌宣言）的待牌");
  await expect(tv.getByTestId("ten-settlement-mirror")).toContainText("被猜中流局");
  await east.getByRole("button", { name: "确认流局" }).click();
  await expect(tv.getByRole("heading", { name: "第 3 局 2 本场" })).toBeVisible();
  await expect(tv.getByTestId("score-0")).toHaveText("6,000");

  // ── 主控台撤销：回到 Stage B，提示写明撤的是哪一步，板上的记号跟着快照回来 ──
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("dialog").getByRole("button", { name: "撤销" }).click();
  await expect(tv.getByText(/撤销了：第 2 局 1 本场 被猜中流局/)).toBeVisible();
  await tv.keyboard.press("Escape");
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage B · 阿西 听牌宣言");
  await expect(tv.getByTestId("guess-tiles").getByLabel("2索")).toHaveAttribute(
    "data-struck",
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

  // ── 重开一局 = 放弃眼下这一场强制从头来：对局中（这里还在 Stage B）就能点，不必先终局 ──
  await west.getByRole("button", { name: "重开一局" }).click();
  await expect(west.getByRole("dialog")).toContainText("放弃眼下这一场");
  await west.getByRole("button", { name: "确认重开" }).click();
  await expect(tv.getByTestId("score-0")).toHaveText("0");
  await expect(tv.getByTestId("sticks-0")).toHaveText("立直棒 10");
  await expect(tv.getByTestId("ten-stage")).toHaveText("Stage A");
  await expect(tv.getByRole("heading", { name: "第 1 局 0 本场" })).toBeVisible();

  await tvCtx.close();
});
