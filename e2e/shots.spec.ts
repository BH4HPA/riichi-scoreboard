import path from "node:path";
import { devices, test, type Browser, type Page } from "@playwright/test";
import { newContext } from "./helpers";

/** 视觉检查用截图脚本：`SHOTS_DIR=/tmp/riichi-shots yarn e2e e2e/shots.spec.ts`；默认不跑。 */
const OUT = process.env.SHOTS_DIR;
test.skip(!OUT, "仅在设置 SHOTS_DIR 时运行");

async function phone(browser: Browser, code: string, name: string): Promise<Page> {
  const ctx = await newContext(browser, { viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  const nameInput = page.getByLabel("昵称");
  await nameInput.fill(name);
  await nameInput.press("Enter");
  return page;
}

test("截图：番符表与主控台", async ({ browser }) => {
  const tvCtx = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  await tv.screenshot({ path: `${OUT}/tv-lobby.png` });
  {
    // 手机首页：Logo + 输码面板 + 底部版权与备案（UA 走手机分流）
    const ctx = await newContext(browser, { ...devices["iPhone 13"] });
    const landing = await ctx.newPage();
    await landing.goto("/");
    await landing.getByLabel("房间码").waitFor({ state: "attached" });
    await landing.screenshot({ path: `${OUT}/phone-landing.png` });
    await ctx.close();
  }
  const phones: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await phone(browser, code, ["Ray", "小明", "阿花", "老王"][i]!);
    await p.getByTestId(`seat-${i}`).click();
    if (i === 0) {
      // 手机大厅：自己已入座 + 三个空座；规则对话框滚到中段时底栏可见
      await p.getByTestId("seat-0").getByText("Ray").waitFor();
      await p.screenshot({ path: `${OUT}/phone-lobby.png`, fullPage: true });
      await p.screenshot({ path: `${OUT}/phone-lobby-viewport.png` });
      await p.getByRole("button", { name: "修改规则" }).click();
      await p.getByRole("dialog").getByText("终局", { exact: true }).scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${OUT}/phone-rules-dialog.png` });
      await p.getByRole("button", { name: "取消" }).click();
    }
    await p.getByRole("button", { name: "准备", exact: true }).click();
    phones.push(p);
  }
  await tv.screenshot({ path: `${OUT}/tv-lobby-full.png` });
  await tv.getByTestId("points-0").waitFor({ timeout: 15_000 }); // 全员准备后自动开局
  await phones[0]!.getByTestId("points-0").waitFor();
  await phones[0]!.screenshot({ path: `${OUT}/phone-game.png` });
  // 底栏轮换的另一态（Logo + 站名）：直接盖掉动画定住两层，不去猜动画走到哪了
  const paused = await phones[0]!.addStyleTag({
    content: `.animate-site-ticker { animation: none !important; opacity: 0 !important; }
      .animate-site-ticker-alt { animation: none !important; opacity: 1 !important; }`,
  });
  await phones[0]!.screenshot({ path: `${OUT}/phone-game-brand.png` });
  await paused.evaluate((el) => el.remove());

  // 手机 2 牌面荣和
  await phones[2]!.getByRole("button", { name: "荣和", exact: true }).click();
  const ron = phones[2]!.getByRole("dialog");
  await ron.getByRole("combobox").first().click();
  await phones[2]!.getByRole("option", { name: "老王" }).click();
  await ron.getByRole("tab", { name: "牌面" }).click();
  const keyboard = ron.getByTestId("tile-keyboard");
  // 闭牌 + 碰 + 暗杠同框
  await ron.getByRole("button", { name: "碰", exact: true }).click();
  await keyboard.getByRole("button", { name: "1索", exact: true }).click();
  await ron.getByRole("button", { name: "暗杠", exact: true }).click();
  await keyboard.getByRole("button", { name: "白", exact: true }).click();
  for (const t of ["2萬", "3萬", "4萬", "5筒", "5筒", "5筒", "7索", "7索"]) {
    await keyboard.getByRole("button", { name: t, exact: true }).click();
  }
  await phones[2]!.screenshot({ path: `${OUT}/phone-ron-melds.png` });
  await ron.getByRole("button", { name: "清空", exact: true }).click();
  const removeMeld = ron.getByRole("button", { name: "删除副露" });
  while ((await removeMeld.count()) > 0) await removeMeld.first().click();
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
  await tv.getByText("正在录入荣和结算").waitFor();
  await tv.waitForTimeout(300);
  await tv.screenshot({ path: `${OUT}/tv-mirror-settlement.png` });
  await ron.getByRole("button", { name: "确认荣和" }).click();
  await tv.getByTestId("points-2").filter({ hasText: "27,000" }).waitFor();
  await tv.getByText("正在录入荣和结算").waitFor({ state: "detached" });
  await tv.screenshot({ path: `${OUT}/tv-game.png` });

  // 番符表：手机打开，电视镜像
  await phones[1]!.getByRole("button", { name: "番符表" }).click();
  await phones[1]!.getByRole("switch", { name: "投到电视" }).click();
  await tv.getByText("正在查看番符表").waitFor();
  await tv.screenshot({ path: `${OUT}/tv-ref-yaku.png` });
  await phones[1]!.screenshot({ path: `${OUT}/phone-ref-yaku.png` });
  const dlg = phones[1]!.getByRole("dialog");
  await dlg.getByRole("tab", { name: "役满", exact: true }).click();
  await tv.getByText("国士无双").first().waitFor();
  await tv.waitForTimeout(500);
  await tv.screenshot({ path: `${OUT}/tv-ref-yakuman.png` });
  await phones[1]!.screenshot({ path: `${OUT}/phone-ref-yakuman.png` });
  await dlg.getByRole("tab", { name: "二番" }).click();
  await phones[1]!.getByText("对对和").waitFor();
  await phones[1]!.getByText("对对和").scrollIntoViewIfNeeded();
  await phones[1]!.screenshot({ path: `${OUT}/phone-ref-2han.png` });
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
  await phones[1]!.keyboard.press("Escape");

  // 窄屏手机（360）对局页与终局页
  await phones[1]!.setViewportSize({ width: 360, height: 780 });
  await phones[1]!.screenshot({ path: `${OUT}/phone-game-360.png`, fullPage: true });
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("button", { name: "终局结算" }).click();
  await tv.getByRole("button", { name: "确认终局" }).click();
  await phones[1]!.getByRole("heading", { name: "终局结算" }).waitFor();
  await phones[1]!.screenshot({ path: `${OUT}/phone-final-360.png`, fullPage: true });
  await tv.getByRole("heading", { name: "终局结算" }).waitFor();
  await tv.screenshot({ path: `${OUT}/tv-final.png` });
  await tvCtx.close();
});

test("截图：Pad 横屏/竖屏的大厅与对局页", async ({ browser }) => {
  for (const [w, h, tag] of [
    [1024, 768, "pad-landscape"],
    [768, 1024, "pad-portrait"],
  ] as const) {
    const ctx = await newContext(browser, { viewport: { width: w, height: h } });
    const tv = await ctx.newPage();
    await tv.goto("/console");
    await tv.getByText("扫码加入").waitFor();
    await tv.screenshot({ path: `${OUT}/${tag}-lobby-qr.png` });
    await tv.getByRole("button", { name: "关闭" }).click();
    await tv.screenshot({ path: `${OUT}/${tag}-lobby.png` });
    for (const [seat, name] of [
      [0, "本地1"],
      [1, "本地2"],
      [2, "本地3"],
      [3, "本地4"],
    ] as const) {
      await tv.getByTestId(`seat-${seat}`).getByRole("button", { name: "添加本地玩家" }).click();
      const dlg = tv.getByRole("dialog");
      await dlg.getByLabel("新建本地玩家").fill(name);
      await dlg.getByRole("button", { name: "创建并入座" }).click();
      await tv.getByTestId(`seat-${seat}`).getByText(name).waitFor();
    }
    await tv.getByRole("button", { name: "开局", exact: true }).click();
    await tv.getByTestId("points-0").waitFor();
    await tv.screenshot({ path: `${OUT}/${tag}-game.png` });
    await tv.getByRole("button", { name: /记录/ }).click();
    await tv.getByRole("dialog").waitFor();
    await tv.waitForTimeout(400);
    await tv.screenshot({ path: `${OUT}/${tag}-history-drawer.png` });
    await ctx.close();
  }
});

test("截图：取景框、确认态与算点数页", async ({ browser }) => {
  const DETECTOR = path.join(import.meta.dirname, "fixtures/detector.onnx");
  const withDetector = async (page: Page) => {
    await page.route("**/riichi/models/*.onnx", (route) =>
      route.fulfill({ path: DETECTOR, contentType: "application/octet-stream" }),
    );
    await page.route("**/api/recognitions/*", (route) => route.fulfill({ status: 204 }));
  };

  // 算点数页：入口（场况卡）→ 规则弹窗 → 取景框（带检测框与牌图标签）→ 核对 → 结果
  const calcCtx = await newContext(browser, { viewport: { width: 400, height: 860 } });
  const calc = await calcCtx.newPage();
  await withDetector(calc);
  // 非手机首页：没有主控台提示，次要链接组只剩一行
  await calc.goto("/");
  await calc.getByRole("link", { name: /拍照算点数/ }).waitFor();
  await calc.screenshot({ path: `${OUT}/desktop-narrow-landing.png` });
  await calc.goto("/calc");
  // 页面是懒加载的：等标题出来再截
  await calc.getByRole("heading", { name: "拍照算点数" }).waitFor();
  await calc.screenshot({ path: `${OUT}/phone-calc-entry.png` });
  await calc.getByRole("button", { name: "M-League" }).click();
  await calc.getByRole("dialog").waitFor();
  await calc.waitForTimeout(200);
  await calc.screenshot({ path: `${OUT}/phone-calc-rules.png` });
  await calc.getByRole("button", { name: "取消" }).click();
  await calc.getByRole("button", { name: /开始拍/ }).click();
  const sheet = calc.getByTestId("camera-sheet");
  await sheet.waitFor();
  // 抢在自动定格之前拍一张取景中的样子；来不及就只留核对态
  await calc.waitForTimeout(120);
  if ((await sheet.count()) > 0)
    await calc.screenshot({ path: `${OUT}/phone-calc-viewfinder.png` });
  await calc.getByTestId("hand-confirm").waitFor({ timeout: 30_000 });
  await calc.getByTestId("annotated-shot").waitFor({ timeout: 15_000 });
  await calc.screenshot({ path: `${OUT}/phone-calc-review.png`, fullPage: true });
  await calc.getByTestId("annotated-shot").click();
  await calc.getByTestId("annotated-lightbox").waitFor();
  await calc.waitForTimeout(200);
  await calc.screenshot({ path: `${OUT}/phone-calc-lightbox.png` });
  await calc.getByTestId("annotated-lightbox").getByRole("button", { name: "关闭" }).click();
  await calc.getByTestId("calc-confirm").click();
  await calc.getByTestId("calc-points").waitFor();
  await calc.screenshot({ path: `${OUT}/phone-calc-result.png`, fullPage: true });
  await calcCtx.close();

  // 摆牌示意：不装假模型，取景页不会自动定格，能从容打开「怎么摆」
  const guideCtx = await newContext(browser, { viewport: { width: 400, height: 860 } });
  const guide = await guideCtx.newPage();
  await guide.route("**/riichi/models/*.onnx", (route) => route.abort());
  await guide.goto("/calc");
  await guide.getByRole("button", { name: /开始拍/ }).click();
  await guide.getByRole("button", { name: "怎么摆" }).click();
  await guide.getByText("怎么摆，识别最准").waitFor();
  await guide.screenshot({ path: `${OUT}/phone-layout-guide.png` });
  // 横屏：界面元素整体转 90°，画面不转
  await guide.getByRole("button", { name: "知道了" }).click();
  await guide.getByTestId("camera-rotate").click();
  await guide.waitForTimeout(150);
  await guide.screenshot({ path: `${OUT}/phone-viewfinder-landscape.png` });
  await guide.getByTestId("camera-rotate").click();
  await guideCtx.close();

  // 房间里的结算确认态：识别通过时键盘收起，只剩一排牌
  const tvCtx = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  const phones: Page[] = [];
  for (const [i, name] of ["Ray", "小明", "阿花", "老王"].entries()) {
    const p = await phone(browser, code, name);
    if (i === 2) await withDetector(p);
    await p.getByTestId(`seat-${i}`).click();
    await p.getByRole("button", { name: "准备", exact: true }).click();
    phones.push(p);
  }
  const p = phones[2]!;
  await p.getByTestId("points-0").waitFor();
  await p.getByRole("button", { name: "荣和", exact: true }).click();
  const dialog = p.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await p.getByRole("option", { name: "老王" }).click();
  await dialog.getByRole("tab", { name: "牌面" }).click();
  await dialog.getByTestId("recognize-button").click();
  await dialog.getByTestId("hand-confirm").waitFor({ timeout: 30_000 });
  await p.screenshot({ path: `${OUT}/phone-ron-confirm.png` });
  // 点一张牌 → 替换面板（顶部可改和张）
  await dialog.getByTestId("hand-confirm").getByRole("button", { name: "1萬" }).click();
  await p.getByRole("dialog").filter({ hasText: "换掉 1萬" }).waitFor();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/phone-tile-replace.png` });
  await tvCtx.close();
});

test("截图：首页选房型与二人房（《天》规则）", async ({ browser }) => {
  const tvCtx = await newContext(browser, {
    ...devices["Desktop Chrome"],
    viewport: { width: 1600, height: 900 },
  });
  const tv = await tvCtx.newPage();
  await tv.goto("/");
  await tv.getByTestId("open-ten").waitFor();
  await tv.screenshot({ path: `${OUT}/desktop-landing-kinds.png` });
  await tv.getByTestId("open-ten").click();
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  await tv.screenshot({ path: `${OUT}/ten-tv-lobby.png` });
  // 回首页：房间还在，按钮写「继续 … 房间码」+「新建」
  await tv.getByRole("link", { name: "返回首页" }).click();
  await tv.getByTestId("new-ten").waitFor();
  await tv.screenshot({ path: `${OUT}/desktop-landing-continue.png` });
  await tv.getByTestId("open-ten").click();

  const east = await phone(browser, code, "阿东");
  const west = await phone(browser, code, "阿西");
  await east.getByTestId("seat-0").click();
  await west.getByTestId("seat-1").click();
  await east.screenshot({ path: `${OUT}/ten-phone-lobby.png` });

  await east.getByRole("button", { name: "规则说明" }).click();
  await east.getByRole("dialog").getByRole("switch", { name: "投到电视" }).click();
  await east
    .getByRole("dialog")
    .locator('[data-page="stageB"]')
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await tv.getByTestId("ten-guide-mirror").getByText("防守方每轮猜 2 张").waitFor();
  await tv.getByTestId("ten-guide-mirror").waitFor();
  await east.screenshot({ path: `${OUT}/ten-phone-guide.png` });
  await tv.screenshot({ path: `${OUT}/ten-tv-guide-mirror.png` });
  await east.keyboard.press("Escape");

  for (const p of [east, west]) await p.getByRole("button", { name: "准备", exact: true }).click();
  await tv.getByTestId("score-0").waitFor({ timeout: 10_000 });
  await tv.screenshot({ path: `${OUT}/ten-tv-stage-a.png` });
  await east.screenshot({ path: `${OUT}/ten-phone-stage-a.png`, fullPage: true });

  await east.getByRole("button", { name: "立直", exact: true }).click();
  const pick = west.getByTestId("guess-tiles");
  for (const n of ["1萬", "9萬", "東", "白", "3筒", "6筒"]) {
    await pick.getByRole("button", { name: n }).click();
  }
  await tv.getByTestId("guess-board").getByText("已划掉 6 种").waitFor();
  await tv.screenshot({ path: `${OUT}/ten-tv-stage-b.png` });
  await west.screenshot({ path: `${OUT}/ten-phone-stage-b-defender.png`, fullPage: true });
  await east.screenshot({ path: `${OUT}/ten-phone-stage-b-attacker.png`, fullPage: true });

  await east.getByRole("button", { name: "自摸", exact: true }).click();
  const dialog = east.getByRole("dialog");
  await dialog.getByRole("tab", { name: "牌面" }).click();
  await east.screenshot({ path: `${OUT}/ten-phone-tsumo-hand.png` });
  await dialog.getByRole("tab", { name: "番符" }).click();
  await dialog.getByRole("button", { name: "3", exact: true }).click();
  await dialog.getByRole("button", { name: "30", exact: true }).click();
  await tv.getByText("+6,000").waitFor();
  await east.screenshot({ path: `${OUT}/ten-phone-tsumo.png` });
  await tv.screenshot({ path: `${OUT}/ten-tv-mirror-tsumo.png` });
  await dialog.getByRole("button", { name: "确认自摸和" }).click();
  await tv.getByTestId("guess-board").waitFor({ state: "detached" });
  await tv.screenshot({ path: `${OUT}/ten-tv-history.png` });

  await west.getByRole("button", { name: "终局", exact: true }).click();
  await west.getByRole("button", { name: "确认终局" }).click();
  await tv.getByTestId("ten-final").waitFor();
  await tv.screenshot({ path: `${OUT}/ten-tv-final.png` });
  await west.screenshot({ path: `${OUT}/ten-phone-final.png`, fullPage: true });

  // Pad 竖屏主控台（单栏）：Stage B 的全牌型板放在得分卡下面
  await west.getByRole("button", { name: "撤销" }).click();
  await west.getByRole("button", { name: "听牌宣言" }).click();
  const padCtx = await newContext(browser, {
    ...devices["iPad Pro 11"],
    storageState: await tvCtx.storageState(),
  });
  const pad = await padCtx.newPage();
  await pad.goto("/console?kind=ten");
  await pad.getByTestId("guess-board").waitFor();
  await pad.screenshot({ path: `${OUT}/ten-pad-stage-b.png`, fullPage: true });
});
