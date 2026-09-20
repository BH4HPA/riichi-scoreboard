import { expect, test, type Browser, type Page } from "@playwright/test";
import { newContext } from "./helpers";

/** 每台"手机"用独立的浏览器上下文，拥有各自的设备 token。 */
async function phone(browser: Browser, code: string): Promise<Page> {
  const ctx = await newContext(browser, { viewport: { width: 400, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByTestId("seat-0")).toBeVisible();
  return page;
}

test("主控台建房 → 四人扫码入座 → 开局 → 手机结算同步电视 → 镜像 → 撤销", async ({ browser }) => {
  const tvCtx = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  // 版权与备案号常驻主控台左栏底部（大厅与对局都不用滚动就能看到）
  const footer = tv.locator("footer");
  await expect(footer.getByRole("link", { name: /^© .+ \d{4}-\d{4}$/ })).toBeInViewport();
  await expect(footer.getByRole("link", { name: /ICP备/ })).toBeInViewport();

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

  // 全员准备且在线 → 主控台开局按钮显示倒计时 → 3 s 后自动开局
  await Promise.all([
    expect(tv.getByRole("button", { name: /开局 ·/ })).toBeVisible(),
    expect(phones[1]!.getByText(/秒后自动开局/)).toBeVisible(),
  ]);
  await expect(tv.getByTestId("points-0")).toHaveText("25,000");
  await expect(phones[0]!.getByTestId("points-0")).toHaveText("25,000");
  await expect(footer.getByRole("link", { name: /^© .+ \d{4}-\d{4}$/ })).toBeInViewport();
  await expect(footer.getByRole("link", { name: /ICP/ })).toBeInViewport();
  // 宽屏对局页也能再打开二维码
  await tv.getByRole("button", { name: "二维码" }).click();
  await expect(tv.getByRole("dialog").getByTestId("room-code")).toHaveText(code);
  await tv.keyboard.press("Escape");

  // 手机底栏：信息行在四个 tab 之下；备案号与站名两层都在，由 CSS 动画轮换（opacity 不进断言：时刻不定）
  const nav = phones[0]!.getByRole("navigation", { name: "功能" });
  const infoBox = await nav.getByText(/^房间/).boundingBox();
  const tabBox = await nav.getByRole("button", { name: "记录" }).boundingBox();
  expect(infoBox!.y).toBeGreaterThan(tabBox!.y + tabBox!.height - 1);
  await expect(nav.getByText(/ICP备/)).toHaveCSS("animation-name", "site-ticker");
  // 站名层必须反相，否则两段字叠在一起
  await expect(nav.locator(".animate-site-ticker-alt")).toHaveCSS("animation-delay", "-10s");

  // 立直音乐：手机 1 按下 → 电视挂上 <audio> 与浮窗；点结算键 → 停（音频请求拦掉，只看状态）
  await tv.route("**/*.mp3", (route) => route.abort());
  await phones[1]!.getByRole("button", { name: "立直", exact: true }).click();
  await expect(tv.getByTestId("riichi-music")).toHaveAttribute("data-track", /^[0-9a-f-]{36}$/);
  await expect(tv.getByTestId("music-float")).toContainText("南家立直 · ");
  await expect(phones[3]!.getByText(/南家立直 · /)).toBeVisible();
  // 他人再按 → 换曲：手机 2 选另一首后按下，电视曲目变化、浮窗换人
  const firstTrack = await tv.getByTestId("riichi-music").getAttribute("data-track");
  await phones[2]!.getByRole("button", { name: /^立直音乐：/ }).click();
  await phones[2]!.getByRole("button", { name: "测试曲二", exact: true }).click();
  await phones[2]!.getByRole("button", { name: "立直", exact: true }).click();
  await expect(tv.getByTestId("music-float")).toContainText("西家立直 · 测试曲二");
  expect(await tv.getByTestId("riichi-music").getAttribute("data-track")).not.toBe(firstTrack);

  // 手机 3 先开着荣和录入（稍后手机 0 记账后它应自动关闭）
  await phones[3]!.getByRole("button", { name: "荣和", exact: true }).click();
  await phones[3]!.getByRole("dialog").getByRole("button", { name: "2", exact: true }).click();

  // 手机 0（庄家）自摸 3 番 30 符 → 2000 all
  await phones[0]!.getByRole("button", { name: "自摸", exact: true }).click();
  await expect(tv.getByTestId("riichi-music")).toHaveCount(0);
  await expect(tv.getByTestId("music-float")).toHaveCount(0);
  const dialog = phones[0]!.getByRole("dialog");
  await expect(dialog.getByText("自摸结算")).toBeVisible();
  // 底部操作栏贴住对话框底边（滚动区无下内边距挡着 sticky）
  const dialogBox = (await dialog.boundingBox())!;
  const footerBox = (await dialog
    .getByRole("button", { name: "确认自摸" })
    .locator("..")
    .boundingBox())!;
  expect(Math.abs(footerBox.y + footerBox.height - (dialogBox.y + dialogBox.height))).toBeLessThan(
    1,
  );
  // 南家、西家按过立直：自摸表单自动勾上
  await expect(dialog.getByRole("checkbox", { name: /^南家/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^西家/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^东家/ })).not.toBeChecked();
  // 番符不给默认值：只选番时仍不能确认
  await dialog.getByRole("button", { name: "3", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "确认自摸" })).toBeDisabled();
  await expect(dialog.getByTestId("settlement-summary")).toHaveText("还需选择：符");
  await dialog.getByRole("button", { name: "30", exact: true }).click();
  await expect(dialog.getByTestId("settlement-summary")).toHaveText("东家 自摸 · 收入 +8,000");
  await expect(tv.getByText("正在录入自摸结算")).toBeVisible();
  // 关掉再开：草稿还在
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(phones[0]!.getByRole("dialog")).toHaveCount(0);
  await phones[0]!.getByRole("button", { name: "自摸", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "30", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: "确认自摸" }).click();
  // 手机 3 的荣和弹窗：局面变了自动关闭并提示，旧输入不会记到新局
  await expect(phones[3]!.getByRole("dialog")).toHaveCount(0);
  await expect(phones[3]!.getByText("局面已变化，结算已关闭")).toBeVisible();
  await expect(phones[0]!.getByText("局面已变化，结算已关闭")).toHaveCount(0);
  // 2000 all + 南西两根立直棒
  await expect(tv.getByTestId("points-0")).toHaveText("33,000");
  await expect(tv.getByTestId("points-1")).toHaveText("22,000");
  await expect(phones[2]!.getByTestId("points-0")).toHaveText("33,000");
  await expect(tv.getByText("东1局1本场")).toBeVisible();
  // 手机入座者默认看「我与三家」的点差
  await expect(phones[1]!.getByText("我的点差")).toBeVisible();
  await expect(phones[1]!.getByText("落后 11,000")).toBeVisible();
  await expect(tv.getByText("正在录入自摸结算")).toHaveCount(0);

  // 宽屏比分/历史分隔可调（默认 3:2）：键盘微调
  const separator = tv.getByRole("separator", { name: /拖动调整/ });
  const before = Number(await separator.getAttribute("aria-valuenow"));
  expect(before).toBe(60);
  await separator.focus();
  await tv.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", String(before + 2));

  // 番符表镜像
  // 默认只在手机上看，打开「投到电视」才投屏
  await phones[1]!.getByRole("button", { name: "番符表" }).click();
  await expect(
    phones[1]!.getByRole("dialog").getByRole("tab", { name: "役满", exact: true }),
  ).toBeVisible();
  await expect(tv.getByText("正在查看番符表")).toHaveCount(0);
  await phones[1]!.getByRole("switch", { name: "投到电视" }).click();
  await expect(tv.getByText("正在查看番符表")).toBeVisible();
  await phones[1]!.getByRole("button", { name: "关闭" }).first().click();
  await expect(tv.getByText("正在查看番符表")).toHaveCount(0);

  // 主控台自身撤销
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("button", { name: "撤销" }).click();
  await expect(tv.getByTestId("points-0")).toHaveText("25,000");
  // 全桌都看到谁撤了哪一笔
  await expect(phones[3]!.getByText("主控台 撤销了：东1局0本场 东家自摸")).toBeVisible();
  await expect(tv.getByText("主控台 撤销了：东1局0本场 东家自摸")).toBeVisible();
  await expect(phones[3]!.getByTestId("points-0")).toHaveText("25,000");
  // 主控台没有座位：选人控件不标相对方位
  await tv.getByRole("button", { name: "自摸", exact: true }).click();
  // 同时只留一层：打开结算时操作面板已收起
  await expect(tv.getByRole("dialog")).toHaveCount(1);
  const tvTsumo = tv.getByRole("dialog").filter({ hasText: "自摸结算" });
  await expect(tvTsumo.getByText("立直情况")).toBeVisible();
  // 撤销了结算：本局立直声明随局面快照回来，表单照样预勾
  await expect(tvTsumo.getByRole("checkbox", { name: "南家", exact: true })).toBeChecked();
  await expect(tvTsumo.getByRole("checkbox", { name: "西家", exact: true })).toBeChecked();
  await expect(tvTsumo).not.toContainText(/上家|对家|下家|自己/);
  // 第一巡自摸按和牌者庄闲命名：东 1 局庄家东家 → 天和，换成南家 → 地和
  // 主控台代记没有默认和牌者：未选时不能确认，底栏提示缺项
  await expect(tvTsumo.getByRole("button", { name: "确认自摸" })).toBeDisabled();
  await expect(tvTsumo.getByTestId("settlement-summary")).toHaveText("还需选择：自摸者、番、符");
  await tvTsumo.getByRole("tab", { name: "牌面" }).click();
  await tvTsumo.getByRole("combobox").first().click();
  await tv.getByRole("option", { name: "东家" }).click();
  await expect(tvTsumo.getByRole("checkbox", { name: "天和", exact: true })).toBeVisible();
  await tvTsumo.getByRole("combobox").first().click();
  await tv.getByRole("option", { name: "南家" }).click();
  await expect(tvTsumo.getByRole("checkbox", { name: "地和", exact: true })).toBeVisible();
  await tvTsumo.getByRole("button", { name: "取消" }).click();
  await expect(tv.getByRole("dialog")).toHaveCount(0);

  // 牌面形态：手机 2 荣和手机 3，平和 1 番 30 符 = 1000
  await phones[2]!.getByRole("button", { name: "荣和", exact: true }).click();
  const ron = phones[2]!.getByRole("dialog");
  await ron.getByRole("combobox").first().click();
  await phones[2]!.getByRole("option", { name: "北家" }).click();
  // 西家视角：北家是下家，立直情况在番符/牌面之上
  await expect(ron.getByRole("combobox").first()).toHaveText("北家下家");
  const riichiRows = ron.getByText("立直情况").locator("..").getByRole("checkbox");
  // 预勾的立直手动取消：之后不会被勾回
  await expect(riichiRows.nth(1)).toBeChecked();
  await riichiRows.nth(1).click();
  await riichiRows.nth(2).click();
  await expect(riichiRows.nth(1)).not.toBeChecked();
  await expect(riichiRows.nth(2)).not.toBeChecked();
  expect((await riichiRows.first().boundingBox())!.y).toBeLessThan(
    (await ron.getByRole("tab", { name: "牌面" }).boundingBox())!.y,
  );
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
  await ron.getByRole("button", { name: "清空", exact: true }).click();
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
    // 点牌键的角：点击区是整个格子（至少 44px 高），不只是牌图
    const key = keyboard.getByRole("button", { name: t, exact: true });
    expect((await key.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await key.click({ position: { x: 1, y: 1 } });
  }
  await expect(ron.getByText("2 番 30 符")).toBeVisible();
  await expect(ron.getByText("赤宝牌 1 番")).toBeVisible();
  // 立直情况勾上和牌者自己 → 手牌立直旗标跟着亮、番数 +1；手牌里取消 → 立直情况跟着取消
  // 电视在重算期间按住上一份牌面与结算文字，不闪：逐帧采样，一帧都不能消失
  const tvGaps = tv.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let gaps = 0;
        const end = performance.now() + 1200;
        const tick = () => {
          const tiles = document.querySelector('[role="img"][aria-label="赤5筒"]');
          if (!tiles || !document.body.innerText.includes("收入 +")) gaps++;
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve(gaps);
        };
        tick();
      }),
  );
  await riichiRows.nth(2).click();
  const handRiichi = ron.getByRole("checkbox", { name: "立直", exact: true });
  await expect(handRiichi).toBeChecked();
  await expect(ron.getByText("3 番 30 符")).toBeVisible();
  expect(await tvGaps).toBe(0);
  await handRiichi.click();
  await expect(riichiRows.nth(2)).not.toBeChecked();
  await expect(ron.getByText("2 番 30 符")).toBeVisible();
  // 反向：手牌里勾上立直 → 立直情况跟着勾上；再取消复原
  await handRiichi.click();
  await expect(riichiRows.nth(2)).toBeChecked();
  await handRiichi.click();
  await expect(riichiRows.nth(2)).not.toBeChecked();
  await expect(ron.getByText("2 番 30 符")).toBeVisible();
  // 电视全屏镜像：和牌者、牌面、番符、役种
  await expect(tv.getByText("正在录入荣和结算")).toBeVisible();
  await expect(tv.getByText("2 番 30 符", { exact: true })).toBeVisible();
  await expect(tv.getByRole("img", { name: "赤5筒" })).toBeVisible();
  await expect(tv.getByText("赤宝牌 1 番")).toBeVisible();
  await ron.getByRole("button", { name: "确认荣和" }).click();
  await expect(tv.getByText("正在录入荣和结算")).toHaveCount(0);
  await expect(tv.getByTestId("points-2")).toHaveText("27,000");
  // 页签记忆：再开荣和默认停在牌面
  await phones[2]!.getByRole("button", { name: "荣和", exact: true }).click();
  await expect(ron.getByRole("tab", { name: "牌面" })).toHaveAttribute("aria-selected", "true");
  await ron.getByRole("button", { name: "取消" }).click();
  await expect(tv.getByTestId("points-3")).toHaveText("23,000");
  await expect(
    tv.getByText("闲家 西家 荣和 北家 2 番 30 符，共 2,000 点，共收入 2,000 点。"),
  ).toBeVisible();
  // 历史记录展示牌面：和张 9萬 单独标出，赤5筒 出现在手牌里，役种 chips
  const historyTable = tv.getByRole("listitem").filter({ hasText: "西家 荣和 北家" });
  await expect(historyTable.getByRole("img", { name: "赤5筒" })).toBeVisible();
  await expect(historyTable.getByText("平和 1 番")).toBeVisible();

  // 立直 → 流局：流局表单同样预勾，立直棒进场供
  await phones[3]!.getByRole("button", { name: "立直", exact: true }).click();
  await phones[0]!.getByRole("button", { name: "流局", exact: true }).click();
  const draw = phones[0]!.getByRole("dialog");
  const drawRiichi = draw.getByText("立直情况").locator("..").getByRole("checkbox");
  await expect(drawRiichi.nth(3)).toBeChecked();
  await expect(drawRiichi.nth(0)).not.toBeChecked();
  await draw.getByRole("button", { name: "确认流局" }).click();
  await expect(tv.getByTestId("points-3")).toHaveText("22,000");

  await tvCtx.close();
});

test("主控台添加本地玩家（免手机）+ 两台手机 → 开局；手机可让本地玩家离座", async ({ browser }) => {
  const tvCtx = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console"); // 新的浏览器上下文没有保存的房间码，会自动新建房间
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";

  // 开局键旁说明还差什么；大厅没有「新房间」键（换房间走「返回首页」→「新建」，或解散后回首页再开）
  await expect(tv.getByText("还差 4 人入座")).toBeVisible();
  await expect(tv.getByRole("button", { name: "新房间" })).toHaveCount(0);

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
    await expect(p.getByRole("button", { name: "准备", exact: true })).toBeVisible();
    phones.push(p);
  }
  // 手机点自己的座位卡即离座，再点回去
  await expect(phones[1]!.getByTestId("seat-3")).toHaveAccessibleName(/离座$/);
  await phones[1]!.getByTestId("seat-3").click();
  await expect(phones[1]!.getByTestId("seat-3")).toHaveAccessibleName(/点击入座$/);
  await phones[1]!.getByTestId("seat-3").click();
  // 手机端也能看到本地玩家已入座，并可让其离座（人人管理员）
  await expect(phones[0]!.getByTestId("seat-0")).toContainText("本地甲");
  await tv.getByTestId("seat-1").getByRole("button", { name: "本地乙 离座" }).click();
  await expect(tv.getByTestId("seat-1")).toContainText("等待加入");
  // 空着一个座位（不会自动开局）：两部手机都准备，手机 2 改规则 → 两人准备都被清；
  // 手机 1 收到提示，改规则的手机 2 自己不提示；本地玩家保持已准备
  await phones[0]!.getByRole("button", { name: "准备", exact: true }).click();
  await phones[1]!.getByRole("button", { name: "准备", exact: true }).click();
  await expect(phones[1]!.getByRole("button", { name: "取消准备" })).toBeVisible();
  await phones[1]!.getByRole("button", { name: "修改规则" }).click();
  const rulesDlg = phones[1]!.getByRole("dialog");
  await rulesDlg
    .getByText("切上满贯", { exact: true })
    .locator("xpath=../..")
    .getByRole("switch")
    .click();
  await rulesDlg.getByRole("button", { name: "应用规则" }).click();
  await expect(phones[0]!.getByText("规则已修改，请重新准备")).toBeVisible();
  await expect(phones[0]!.getByRole("button", { name: "准备", exact: true })).toBeVisible();
  await expect(phones[1]!.getByRole("button", { name: "准备", exact: true })).toBeVisible();
  await expect(phones[1]!.getByText("规则已修改，请重新准备")).toHaveCount(0);
  await expect(tv.getByTestId("seat-0")).toContainText("已准备");
  // 从已有列表再次入座
  await tv.getByTestId("seat-1").getByRole("button", { name: "添加本地玩家" }).click();
  await tv
    .getByRole("dialog")
    .getByRole("listitem")
    .filter({ has: tv.getByRole("button", { name: "删除 本地乙" }) })
    .getByRole("button", { name: "入座" })
    .click();
  await expect(tv.getByTestId("seat-1")).toContainText("本地乙");

  // 两部手机准备 → 倒计时开始（本地玩家入座即准备）→ 主控台在倒计时内手动开局
  await phones[0]!.getByRole("button", { name: "准备", exact: true }).click();
  await expect(tv.getByRole("button", { name: /开局 ·/ })).toHaveCount(0);
  await phones[1]!.getByRole("button", { name: "准备", exact: true }).click();
  await tv.getByRole("button", { name: /开局 ·/ }).click();
  await expect(tv.getByTestId("points-0")).toHaveText("25,000");
  await expect(phones[1]!.getByTestId("points-1")).toHaveText("25,000");

  // 终局：手机只留终局表与撤销/重做/调整场况/返回大厅/重开，不再有自摸荣和、立直与点差
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("button", { name: "终局结算" }).click();
  await tv.getByRole("button", { name: "确认终局" }).click();
  await expect(phones[0]!.getByRole("heading", { name: "终局结算" })).toBeVisible();
  await expect(phones[0]!.getByRole("button", { name: "自摸", exact: true })).toHaveCount(0);
  await expect(phones[0]!.getByRole("button", { name: "立直", exact: true })).toHaveCount(0);
  await expect(phones[0]!.getByText("我的点差")).toHaveCount(0);
  await expect(phones[0]!.getByRole("button", { name: "调整场况" })).toBeVisible();
  await expect(phones[0]!.getByRole("button", { name: "返回大厅" })).toBeVisible();
  // 撤回终局，回到对局中
  await phones[0]!.getByRole("button", { name: "撤销" }).click();
  await expect(phones[0]!.getByRole("button", { name: "自摸", exact: true })).toBeVisible();

  // 对局中解散（入口在「操作」对话框）：手机看到提示；主控台回首页，不再自动开新房，且没有错误提示
  await tv.getByRole("button", { name: "操作" }).click();
  await tv.getByRole("button", { name: "解散房间" }).click();
  // 确认框如实说明之后会怎样：回首页，不再说「随即开一个新房间」
  await expect(tv.getByRole("dialog")).toContainText("本机回到首页");
  await tv.getByRole("button", { name: "解散", exact: true }).click();
  await expect(phones[0]!.getByText(`房间 ${code} 已解散`)).toBeVisible();
  await expect(tv).toHaveURL(/\/$/);
  // 解散的房间已经忘掉：首页写的是「创建」而不是「继续」
  await expect(tv.getByTestId("open-yonma")).toHaveText(/创建四人麻将房间/);
  await expect(tv.getByText("操作失败")).toHaveCount(0);
  await expect(tv.getByText("连接已断开")).toHaveCount(0);
  await tvCtx.close();
});

test("两台手机同时开着流局确认：一台确认后另一台自动关闭，不会多记一局", async ({ browser }) => {
  const tvCtx = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";
  const phones: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await phone(browser, code);
    await p.getByTestId(`seat-${i}`).click();
    await p.getByRole("button", { name: "准备", exact: true }).click();
    phones.push(p);
  }
  await expect(tv.getByTestId("points-0")).toHaveText("25,000");
  const [a, b] = [phones[0]!, phones[1]!];
  await a.getByRole("button", { name: "流局", exact: true }).click();
  await b.getByRole("button", { name: "流局", exact: true }).click();
  await a.getByRole("dialog").getByRole("button", { name: "确认流局" }).click();
  // 全员未听：庄家下庄，东2局1本场
  await expect(tv.getByText("东2局1本场")).toBeVisible();
  // 乙的弹窗文案看起来仍然成立——不关掉的话再点一次就是东3局2本场
  await expect(b.getByRole("dialog")).toHaveCount(0);
  await expect(b.getByText("局面已变化，结算已关闭")).toBeVisible();
  // 自己提交的那一笔不算「局面变了」
  await expect(a.getByText("局面已变化，结算已关闭")).toHaveCount(0);
  await expect(tv.getByText("东2局1本场")).toBeVisible();
  await tvCtx.close();
});

test("离线的设备玩家座位可被他人回收；手机可退出房间回首页", async ({ browser }) => {
  const tvCtx = await newContext(browser, { viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/console");
  const code = (await tv.getByTestId("room-code").textContent())?.trim() ?? "";

  // 手机 A 入座并准备，然后整个浏览器上下文关闭（相当于手机被杀掉/换了浏览器）
  const ctxA = await newContext(browser, { viewport: { width: 400, height: 800 } });
  const a = await ctxA.newPage();
  await a.goto(`/r/${code}`);
  await a.getByLabel("昵称").fill("旧身份");
  await a.getByLabel("昵称").press("Enter");
  await a.getByTestId("seat-0").click();
  await a.getByRole("button", { name: "准备", exact: true }).click();
  await expect(tv.getByTestId("seat-0")).toContainText("已准备");
  await expect(tv.getByTestId("seat-0")).not.toContainText("离线");
  await ctxA.close();
  await expect(tv.getByTestId("seat-0")).toContainText("离线");

  // 手机 B（新身份）看到 A 离线，可请离后自己入座
  const b = await phone(browser, code);
  await expect(b.getByTestId("seat-0")).toContainText("离线");
  await b.getByTestId("seat-0").getByRole("button", { name: "旧身份 离座" }).click();
  await expect(b.getByTestId("seat-0")).toHaveAccessibleName(/点击入座$/);
  await b.getByTestId("seat-0").click();
  await expect(tv.getByTestId("seat-0")).not.toContainText("离线");

  // 退出房间：先离座再回首页；主控台上座位变空
  await b.getByRole("button", { name: "退出房间" }).click();
  // 测试用的是桌面 UA，首页会按设备分流进主控台；只要离开了房间路由即可
  await expect(b).not.toHaveURL(/\/r\//);
  await expect(tv.getByTestId("seat-0")).toContainText("等待加入");
  await tvCtx.close();
});
