import { describe, expect, it } from "vitest";
import { AKA, TILE } from "../types/tiles";
import { RECOGNITION_CLASSES, tileOfClassId } from "./classes";
import { layoutHand } from "./layout";
import type { Detection } from "./types";

const W = 40;
const H = 56;

/** 一张牌：name 为类名（1m…0s、1z…7z、back），(x, y) 为左上角；side = 横置。 */
function det(
  name: string,
  x: number,
  y: number,
  opts: { side?: boolean; conf?: number } = {},
): Detection {
  const cls = RECOGNITION_CLASSES.indexOf(name);
  if (cls < 0) throw new Error(name);
  const [w, h] = opts.side ? [H, W] : [W, H];
  return { cls, conf: opts.conf ?? 0.95, box: [x, y, x + w, y + h] };
}

/**
 * 一行连排，从 x0 开始；names 里以 `~` 结尾的横置。真实照片的行不会对齐、牌也不会排得笔直：
 * 每张带 ±3 px 的确定性抖动。返回牌与行尾 x。
 */
function row(names: string[], x0: number, y: number): { dets: Detection[]; end: number } {
  const dets: Detection[] = [];
  let x = x0;
  names.forEach((n, i) => {
    const side = n.endsWith("~");
    const jx = ((i * 7) % 7) - 3;
    const jy = ((i * 5) % 7) - 3;
    dets.push(det(side ? n.slice(0, -1) : n, x + jx, y + jy, { side }));
    x += (side ? H : W) + 2;
  });
  return { dets, end: x };
}

const GAP = 40; // 组间留空一张
const CLOSED13 = ["1m", "2m", "3m", "4p", "0p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p"];

/** 把横排场景转成竖拍：dir=1 顺时针（x' = maxY − y），dir=−1 逆时针（y' = maxX − x）。 */
function rotate(dets: Detection[], dir: 1 | -1): Detection[] {
  const maxX = Math.max(...dets.map((d) => d.box[2])) + 20;
  const maxY = Math.max(...dets.map((d) => d.box[3])) + 20;
  return dets.map((d) => {
    const [x1, y1, x2, y2] = d.box;
    return {
      ...d,
      box: dir === 1 ? [maxY - y2, x1, maxY - y1, x2] : [y1, maxX - x2, y2, maxX - x1],
    };
  });
}

describe("layoutHand", () => {
  it("13 张暗牌 + 横放和张（右端）+ 一张表宝牌", () => {
    const hand = row([...CLOSED13, "9m~"], 10, 200);
    const dora = row(["6s"], 30, 100);
    const { hand: h, warnings } = layoutHand([...hand.dets, ...dora.dets]);
    expect(warnings).toEqual([]);
    expect(h.winTile).toBe(TILE.M9);
    expect(h.closed).toHaveLength(14);
    expect(h.closed[13]).toBe(TILE.M9);
    expect(h.closed).toContain(AKA.P5);
    expect(h.melds).toEqual([]);
    expect(h.doraIndicators).toEqual([TILE.S6]);
    expect(h.uraIndicators).toEqual([]);
  });

  it("和张横放在左端也认；两行指示牌上表下里", () => {
    const hand = row(
      ["3s~", "5m", "6m", "7m", "9p", "9p", "9p", "8m", "8m", "8m", "4s", "4s", "4s", "5s"],
      10,
      300,
    );
    const dora = row(["6s", "3s"], 47, 100);
    const ura = row(["8p", "6s"], 22, 180);
    const { hand: h, warnings } = layoutHand([...hand.dets, ...dora.dets, ...ura.dets]);
    expect(warnings).toEqual([]);
    expect(h.winTile).toBe(TILE.S3);
    expect(h.closed[13]).toBe(TILE.S3);
    expect(h.doraIndicators).toEqual([TILE.S6, TILE.S3]);
    expect(h.uraIndicators).toEqual([TILE.P8, TILE.S6]);
  });

  it("副露在右侧：碰（含横置）+ 吃 + 明杠；组按大小识别", () => {
    const closed = row(["2m", "3m", "4m", "5s", "5s~"], 10, 200);
    const pon = row(["8m", "8m~", "8m"], closed.end + GAP, 200);
    const chi = row(["5p~", "6p", "7p"], pon.end + GAP, 200);
    const kan = row(["1z", "1z", "1z~", "1z"], chi.end + GAP, 200);
    const { hand: h, warnings } = layoutHand([
      ...closed.dets,
      ...pon.dets,
      ...chi.dets,
      ...kan.dets,
    ]);
    expect(warnings).toEqual([]);
    expect(h.closed).toEqual([TILE.M2, TILE.M3, TILE.M4, TILE.S5, TILE.S5]);
    expect(h.winTile).toBe(TILE.S5);
    expect(h.melds).toEqual([
      { open: true, tiles: [TILE.M8, TILE.M8, TILE.M8] },
      { open: true, tiles: [TILE.P5, TILE.P6, TILE.P7] },
      { open: true, tiles: [TILE.East, TILE.East, TILE.East, TILE.East] },
    ]);
  });

  it("副露在下方一行、暗杠在上方一行、各行起点不对齐；指示牌再往上", () => {
    const closed = row(["5m", "6m", "7m", "4s", "4s", "4s", "5s", "3s~"], 10, 300);
    const ankan = row(["back", "6z", "6z", "back"], 31, 210);
    const chi = row(["2s~", "3s", "4s"], 25, 380);
    const dora = row(["6s", "3s"], 68, 130);
    const ura = row(["8p", "6s"], 47, 60);
    const { hand: h, warnings } = layoutHand([
      ...closed.dets,
      ...ankan.dets,
      ...chi.dets,
      ...dora.dets,
      ...ura.dets,
    ]);
    expect(warnings).toEqual([]);
    expect(h.winTile).toBe(TILE.S3);
    expect(h.melds).toEqual([
      { open: false, tiles: [TILE.Hatsu, TILE.Hatsu, TILE.Hatsu, TILE.Hatsu] },
      { open: true, tiles: [TILE.S2, TILE.S3, TILE.S4] },
    ]);
    // 上表下里：离手牌近的 (y=130) 是里宝
    expect(h.uraIndicators).toEqual([TILE.S6, TILE.S3]);
    expect(h.doraIndicators).toEqual([TILE.P8, TILE.S6]);
  });

  it("竖拍（手机没转）：顺时针、逆时针两个方向都按列读", () => {
    const scene = [
      ...row([...CLOSED13, "9m~"], 10, 300).dets,
      ...row(["6s", "3s"], 30, 200).dets,
      ...row(["8p", "6s"], 50, 100).dets,
    ];
    for (const dir of [1, -1] as const) {
      const { hand: h, warnings } = layoutHand(rotate(scene, dir));
      expect(warnings).toEqual([]);
      expect(h.winTile).toBe(TILE.M9);
      expect(h.closed).toHaveLength(14);
      // 旋转方向决定行内左右顺序，指示牌是集合，只比内容
      expect([...h.doraIndicators].sort()).toEqual([TILE.P8, TILE.S6].sort());
      expect([...h.uraIndicators].sort()).toEqual([TILE.S3, TILE.S6].sort());
    }
  });

  it("倾斜的一行仍聚成一行", () => {
    const names = [...CLOSED13, "9m~"];
    const dets = names.map((n, i) =>
      det(n.replace("~", ""), 10 + i * 42, 200 + i * 4, { side: n.endsWith("~") }),
    );
    const { hand: h, warnings } = layoutHand(dets);
    expect(warnings).toEqual([]);
    expect(h.closed).toHaveLength(14);
  });

  it("没有横放的和张：取末张并告警；多张横放：取末张并告警", () => {
    const a = layoutHand(row([...CLOSED13, "9m"], 10, 200).dets);
    expect(a.warnings.map((w) => w.code)).toEqual(["no_win_tile"]);
    expect(a.hand.winTile).toBe(TILE.M9);
    // 两张横放且拆不出合法副露（1m 5p 9s 不成组）→ 整组当暗牌，取最后一张横放并告警
    const b = layoutHand(row(["1m~", "5p", "9s", ...CLOSED13.slice(3), "9m~"], 10, 200).dets);
    expect(b.warnings.map((w) => w.code)).toEqual(["multi_win"]);
    expect(b.hand.winTile).toBe(TILE.M9);
    // 两张横放但能拆成「吃 123m + 暗牌」→ 按副露解释，不告警
    const c = layoutHand(row(["1m~", ...CLOSED13.slice(1), "9m~"], 10, 200).dets);
    expect(c.warnings).toEqual([]);
    expect(c.hand.melds).toEqual([{ open: true, tiles: [TILE.M1, TILE.M2, TILE.M3] }]);
  });

  it("漏认一张牌把暗牌切成两段：取最大的一段并告警，指示牌行不会被当成暗牌", () => {
    const left = row(["5m", "6m", "7m", "4s", "4s"], 10, 300);
    const right = row(["5s", "3s~"], left.end + W + 2, 300); // 中间少认了一张，右段 2 张含横置
    const dora = row(["6s", "3s"], 30, 200);
    const ura = row(["8p", "6s"], 50, 100);
    const { hand: h, warnings } = layoutHand([
      ...left.dets,
      ...right.dets,
      ...dora.dets,
      ...ura.dets,
    ]);
    // 含横置和张的右段被当作暗牌，左段成为多余牌；和张与指示牌都对，张数由 count 提示用户补
    expect(warnings.map((w) => w.code)).toEqual(["extra_rows", "count"]);
    expect(h.closed).toEqual([TILE.S5, TILE.S3]);
    expect(h.winTile).toBe(TILE.S3);
    expect(h.doraIndicators).toEqual([TILE.P8, TILE.S6]);
    expect(h.uraIndicators).toEqual([TILE.S6, TILE.S3]);
  });

  it("四杠时 5 张指示牌与 2 张暗牌：含横置和张的那组才是暗牌", () => {
    const closed = row(["2p", "2p~"], 10, 300);
    const kans = ["1z", "2z", "3z", "4z"].map(
      (t, i) => row([t, t, `${t}~`, t], 10 + i * 230, 380).dets,
    );
    const dora = row(["1m", "2m", "3m", "4m", "5m"], 10, 200);
    const { hand: h, warnings } = layoutHand([...closed.dets, ...kans.flat(), ...dora.dets]);
    expect(warnings).toEqual([]);
    expect(h.closed).toEqual([TILE.P2, TILE.P2]);
    expect(h.melds).toHaveLength(4);
    expect(h.doraIndicators).toHaveLength(5);
  });

  it("副露超过 4 组只取前 4 组并告警", () => {
    const closed = row(["2p", "2p~"], 10, 300);
    const melds = ["1z", "2z", "3z", "4z", "5z"].map(
      (t, i) => row([t, t, `${t}~`], 10 + i * 190, 380).dets,
    );
    const { hand: h, warnings } = layoutHand([...closed.dets, ...melds.flat()]);
    expect(h.melds).toHaveLength(4);
    expect(warnings.map((w) => w.code)).toEqual(["bad_group"]);
  });

  it("暗杠中间两张不一致取置信度高的并告警", () => {
    const closed = row(
      ["5m", "6m", "7m", "8m", "8m", "8m", "4s", "4s", "4s", "5s", "3s~"],
      10,
      300,
    );
    const ankan = [
      det("back", 10, 210),
      det("6z", 52, 210, { conf: 0.6 }),
      det("7z", 94, 210, { conf: 0.9 }),
      det("back", 136, 210),
    ];
    const { hand: h, warnings } = layoutHand([...closed.dets, ...ankan]);
    expect(warnings.map((w) => w.code)).toEqual(["kan_mismatch"]);
    expect(h.melds[0]).toEqual({
      open: false,
      tiles: [TILE.Chun, TILE.Chun, TILE.Chun, TILE.Chun],
    });
  });

  it("张数不对 → count；零检测 → no_tiles；低置信度不再告警，只体现在来源里", () => {
    const twelve = row([...CLOSED13.slice(0, 11), "9m~"], 10, 200);
    expect(layoutHand(twelve.dets).warnings.map((w) => w.code)).toContain("count");
    expect(layoutHand([]).warnings.map((w) => w.code)).toEqual(["no_tiles"]);
    const low = row([...CLOSED13, "9m~"], 10, 200).dets;
    low[0] = { ...low[0]!, conf: 0.45 };
    const { warnings, provenance } = layoutHand(low);
    expect(warnings).toEqual([]);
    // 低置信的那张仍然参与布局，界面按 detections[det].conf 自己决定打不打记号
    expect(provenance.closed.map((o) => o.det)).toContain(0);
    expect(provenance.closed.every((o) => !o.guessed)).toBe(true);
  });

  it("裁剪没裁干净：上方多出的整齐一行（6 张）被忽略并告警；有牌背的行不当指示牌", () => {
    const hand = row([...CLOSED13, "9m~"], 10, 400);
    const dora = row(["6s"], 30, 300);
    const river = row(["1z", "2z", "3z", "4z", "5z", "6z"], 10, 100);
    const backs = row(["back", "7p"], 10, 200);
    const { hand: h, warnings } = layoutHand([
      ...hand.dets,
      ...dora.dets,
      ...river.dets,
      ...backs.dets,
    ]);
    expect(warnings.map((w) => w.code)).toEqual(["extra_rows"]);
    expect(h.doraIndicators).toEqual([TILE.S6]);
    expect(h.closed).toHaveLength(14);
  });

  it("副露之间不留空：碰与吃连成一排，靠横置与牌型拆开（实拍 IMG_1829）", () => {
    const closed = row(["2p", "3p", "4p", "6p", "7p", "5s", "5s", "8p~"], 10, 300);
    const melds = row(["2s", "2s~", "2s", "3m~", "2m", "4m"], 30, 400); // 碰 222s 紧接 吃 234m
    const dora = row(["6p"], 20, 200);
    const { hand: h, warnings } = layoutHand([...closed.dets, ...melds.dets, ...dora.dets]);
    expect(warnings).toEqual([]);
    expect(h.winTile).toBe(TILE.P8);
    expect(h.melds).toEqual([
      { open: true, tiles: [TILE.S2, TILE.S2, TILE.S2] },
      { open: true, tiles: [TILE.M3, TILE.M2, TILE.M4] },
    ]);
    expect(h.doraIndicators).toEqual([TILE.P6]);
  });

  it("暗牌与副露连在一排不留空：暗牌段 + 副露段一起拆", () => {
    const line = row(
      [
        "2m",
        "3m",
        "4m",
        "5s",
        "5s",
        "6p",
        "7p",
        "8p~",
        "8m",
        "8m~",
        "8m",
        "back",
        "1z",
        "1z",
        "back",
      ],
      10,
      300,
    );
    const { hand: h, warnings } = layoutHand(line.dets);
    expect(warnings).toEqual([]);
    // 「6p 7p 8p~」既可当吃也可当暗牌末尾，取暗牌段更长的解释
    expect(h.closed).toEqual([
      TILE.M2,
      TILE.M3,
      TILE.M4,
      TILE.S5,
      TILE.S5,
      TILE.P6,
      TILE.P7,
      TILE.P8,
    ]);
    expect(h.winTile).toBe(TILE.P8);
    expect(h.melds).toEqual([
      { open: true, tiles: [TILE.M8, TILE.M8, TILE.M8] },
      { open: false, tiles: [TILE.East, TILE.East, TILE.East, TILE.East] },
    ]);
  });

  it("加杠两张横置叠放也是杠；斜拍压扁的横置牌（宽略大于高）仍算横置；手牌行里的误检牌背被跳过", () => {
    const closed = row(["1p", "2p", "3p", "4p", "4p", "6p", "7p", "5p~"], 10, 300);
    const kakan = [
      det("7z", 30, 400),
      det("7z", 72, 380, { side: true }),
      det("7z", 72, 420, { side: true }),
      det("7z", 130, 400),
    ];
    const pon = row(["8p", "8p~", "8p"], 260, 400).dets.map((d, i) =>
      i === 1
        ? { ...d, box: [d.box[0], d.box[1], d.box[0] + 46, d.box[1] + 42] as Detection["box"] }
        : d,
    );
    const stray = det("back", 178, 300, { conf: 0.45 }); // 手牌行中间的误检（过了硬门槛）
    const dropped = det("5z", 60, 240, { conf: 0.3 }); // 指示牌区域的误检（低于硬门槛，不参与）
    const narrow: Detection = { ...det("8p", 120, 210), box: [120, 210, 140, 266] }; // 形状异常的框
    const dora = row(["5p"], 20, 200);
    const { hand: h, warnings } = layoutHand([
      ...closed.dets,
      ...kakan,
      ...pon,
      stray,
      dropped,
      narrow,
      ...dora.dets,
    ]);
    expect(warnings.map((w) => w.code)).toEqual(["odd_box", "back_in_hand"]);
    expect(h.closed).toHaveLength(8);
    expect(h.winTile).toBe(TILE.P5);
    expect(h.melds).toEqual([
      { open: true, tiles: [TILE.Chun, TILE.Chun, TILE.Chun, TILE.Chun] },
      { open: true, tiles: [TILE.P8, TILE.P8, TILE.P8] },
    ]);
    expect(h.doraIndicators).toEqual([TILE.P5]);
  });

  it("白板被认成牌背的明杠按同一张补齐；暗杠里的赤五记进杠", () => {
    const closed = row(["1m", "6m", "6m", "6m", "2p", "3p", "4p", "1m~"], 10, 300);
    const kan = row(["5z", "5z~", "5z~", "back"], 20, 400); // 加杠形状，第四张白板认成了牌背
    const ankan = row(["back", "5p", "0p", "back"], kan.end + GAP, 400);
    const { hand: h, warnings } = layoutHand([...closed.dets, ...kan.dets, ...ankan.dets]);
    expect(warnings.map((w) => w.code)).toEqual(["back_in_hand"]);
    expect(h.melds).toEqual([
      { open: true, tiles: [TILE.Haku, TILE.Haku, TILE.Haku, TILE.Haku] },
      { open: false, tiles: [TILE.P5, TILE.P5, TILE.P5, AKA.P5] },
    ]);
  });

  it("明杠第四张叠在横置牌上（高出一张牌宽）仍归入同一组", () => {
    const closed = row(["2s", "3s", "4s", "5p", "6p", "7p", "1z", "4s~"], 10, 300);
    const kan = row(["7z~", "7z", "7z"], 20, 420); // 第一张横置，第四张叠在它上面
    const stacked = det("7z", 22, 420 - W + 2, { side: true });
    const pon = row(["3m", "3m~", "3m"], kan.end + GAP, 420);
    const dora = row(["6s"], 20, 200);
    const { hand: h, warnings } = layoutHand([
      ...closed.dets,
      ...kan.dets,
      stacked,
      ...pon.dets,
      ...dora.dets,
    ]);
    expect(warnings).toEqual([]);
    expect(h.closed).toHaveLength(8);
    expect(h.winTile).toBe(TILE.S4);
    expect(h.melds).toEqual([
      { open: true, tiles: [TILE.Chun, TILE.Chun, TILE.Chun, TILE.Chun] },
      { open: true, tiles: [TILE.M3, TILE.M3, TILE.M3] },
    ]);
    expect(h.doraIndicators).toEqual([TILE.S6]);
  });

  it("赤五按类名映射为 35/36/37", () => {
    const hand = row(["0m", "0p", "0s", ...CLOSED13.slice(3), "9m~"], 10, 200);
    const { hand: h } = layoutHand(hand.dets);
    expect(h.closed.slice(0, 3)).toEqual([AKA.M5, AKA.P5, AKA.S5]);
  });

  it("副露里一张牌认错、整组拆不开：整组当暗牌交给用户改，不让两张的指示牌行冒充暗牌", () => {
    // 碰 8m 的第三张认成了 9m，与暗牌连排
    const hand = row(["2m", "3m", "4m", "5s", "5s", "6p", "7p", "8p~", "8m", "8m~", "9m"], 10, 300);
    const dora = row(["6s", "3s"], 30, 200);
    const { hand: h, warnings } = layoutHand([...hand.dets, ...dora.dets]);
    expect(h.closed).toHaveLength(11);
    expect(h.melds).toEqual([]);
    expect(h.doraIndicators).toEqual([TILE.S6, TILE.S3]);
    expect(warnings.map((w) => w.code)).toEqual(["multi_win", "count"]);
  });

  it("暗牌的横放和张与下一行同种牌的碰不会被当成叠放合并", () => {
    const closed = row(
      ["2m", "3m", "4m", "6p", "7p", "8p", "1z", "1z", "9s", "9s", "5s~"],
      10,
      300,
    );
    const pon = row(["5s", "5s~", "5s"], 300, 300 + Math.round(H * 0.8)); // 紧贴的下一行，横置 5s 与和张同列
    const { hand: h, warnings } = layoutHand([...closed.dets, ...pon.dets]);
    expect(warnings).toEqual([]);
    expect(h.winTile).toBe(TILE.S5);
    expect(h.closed).toHaveLength(11);
    expect(h.melds).toEqual([{ open: true, tiles: [TILE.S5, TILE.S5, TILE.S5] }]);
  });

  it("碰旁边的误检牌背不会把碰升成杠（只有白板才容一张牌背）", () => {
    const closed = row(
      ["2m", "3m", "4m", "6p", "7p", "8p", "1z", "1z", "9s", "9s", "3s~"],
      10,
      300,
    );
    const pon = row(["8m", "8m~", "8m", "back"], closed.end + GAP, 300);
    const { hand: h, warnings } = layoutHand([...closed.dets, ...pon.dets]);
    expect(h.melds).toEqual([{ open: true, tiles: [TILE.M8, TILE.M8, TILE.M8] }]);
    expect(warnings.map((w) => w.code)).toEqual(["back_in_hand"]);
  });

  it("照片里只有副露、没有暗牌：副露照常收集，不把副露当暗牌双计", () => {
    const pon = row(["3m", "3m~", "3m"], 10, 200);
    const { hand: h, warnings } = layoutHand(pon.dets);
    expect(h.closed).toEqual([]);
    expect(h.melds).toEqual([{ open: true, tiles: [TILE.M3, TILE.M3, TILE.M3] }]);
    expect(warnings.map((w) => w.code)).toEqual(["bad_group", "count"]);
  });

  it("永不抛错、有界耗时：对抗连排（300 张同种牌每三张一横）与随机/退化框", () => {
    // 不记忆化的拆分是指数级：这条 300 张的输入曾经跑不完
    const adversarial = Array.from({ length: 300 }, (_, i) =>
      det("1m", 10 + i * 42, 200, { side: i % 3 === 1 }),
    );
    const t0 = Date.now();
    expect(() => layoutHand(adversarial)).not.toThrow();
    expect(Date.now() - t0).toBeLessThan(500); // 本机 ≈ 15 ms，留给慢 CI 的余量
    // 退化框：零面积、反向、单张、全牌背
    expect(layoutHand([{ cls: 0, conf: 0.9, box: [5, 5, 5, 5] }]).warnings[0]!.code).toBe(
      "no_tiles",
    );
    expect(() => layoutHand([{ cls: 0, conf: 0.9, box: [9, 9, 1, 1] }])).not.toThrow();
    expect(() => layoutHand(row(["back", "back", "back"], 0, 0).dets)).not.toThrow();
    let seed = 7;
    const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647) as number;
    for (let n = 0; n < 2000; n++) {
      const dets: Detection[] = Array.from({ length: Math.floor(rnd() * 40) }, () => {
        const x = rnd() * 600;
        const y = rnd() * 600;
        const w = rnd() < 0.1 ? 0 : rnd() * 80;
        const h = rnd() < 0.1 ? 0 : rnd() * 80;
        return { cls: Math.floor(rnd() * 38), conf: rnd(), box: [x, y, x + w, y + h] };
      });
      expect(() => layoutHand(dets)).not.toThrow();
    }
  });

  it("来源：每张牌都指回原始下标，采信的框覆盖全部输入", () => {
    const hand = row([...CLOSED13.slice(0, 10), "9m~"], 10, 400);
    const pon = row(["8p", "8p~", "8p"], hand.end + GAP, 400);
    const ura = row(["1z"], 30, 280);
    const dora = row(["6s"], 30, 200);
    const dets = [...hand.dets, ...pon.dets, ...ura.dets, ...dora.dets];
    const { hand: h, provenance: p, warnings } = layoutHand(dets);
    expect(warnings).toEqual([]);

    // 逐位指回去，取出来的类就是布局给出的那张牌
    const tileAt = (o: { det: number }) =>
      tileOfClassId(dets[o.det]!.cls as Detection["cls"]) ?? null;
    expect(p.closed).toHaveLength(h.closed.length);
    h.closed.forEach((t, i) => expect(tileAt(p.closed[i]!)).toBe(t));
    expect(p.melds).toHaveLength(1);
    h.melds[0]!.tiles.forEach((t, j) => expect(tileAt(p.melds[0]![j]!)).toBe(t));
    expect(tileAt(p.doraIndicators[0]!)).toBe(TILE.S6);
    expect(tileAt(p.uraIndicators[0]!)).toBe(TILE.East);
    expect(p.closed.every((o) => !o.guessed)).toBe(true);

    // 这张照片里每一个框都被采信，回流可以自动打标
    expect(p.usedDetections).toEqual(dets.map((_, i) => i));
  });

  it("来源：猜出来的位置标 guessed —— 和张歧义、和张缺失、暗杠不一致、杠里补齐", () => {
    // 两张横置且拆不出合法副露 → 和张取最后一张，标 guessed
    const multi = row(["1m~", "5p", "9s", ...CLOSED13.slice(3), "9m~"], 10, 200);
    const mw = layoutHand(multi.dets).provenance;
    expect(mw.closed[mw.closed.length - 1]!.guessed).toBe(true);
    expect(mw.closed.slice(0, -1).every((o) => !o.guessed)).toBe(true);

    // 没有横置 → 取末张，标 guessed
    const none = row([...CLOSED13, "9m"], 10, 200);
    const nw = layoutHand(none.dets).provenance;
    expect(nw.closed[nw.closed.length - 1]!.guessed).toBe(true);

    // 暗杠中间两张不一致 → 整组标 guessed 且没有框（四张牌与两个可见框对不上）
    const closed11 = row(CLOSED13.slice(0, 10).concat("9m~"), 10, 400);
    const ankan = [
      det("back", closed11.end + GAP, 400),
      det("5z", closed11.end + GAP + 42, 400),
      det("6z", closed11.end + GAP + 84, 400),
      det("back", closed11.end + GAP + 126, 400),
    ];
    const kw = layoutHand([...closed11.dets, ...ankan]);
    expect(kw.warnings.map((w) => w.code)).toContain("kan_mismatch");
    expect(kw.provenance.melds[0]!.every((o) => o.det === -1 && o.guessed)).toBe(true);

    // 杠里一张认成牌背 → 补出来的那张没有框且标 guessed
    const closed11b = row(CLOSED13.slice(0, 10).concat("9m~"), 10, 400);
    const kan = row(["5z", "5z~", "5z"], closed11b.end + GAP, 400).dets;
    kan.push(det("back", closed11b.end + GAP + 130, 400));
    const bw = layoutHand([...closed11b.dets, ...kan]);
    expect(bw.warnings.map((w) => w.code)).toContain("back_in_hand");
    const last = bw.provenance.melds[0]![bw.provenance.melds[0]!.length - 1]!;
    expect(last).toEqual({ det: -1, guessed: true });
  });

  it("告警分级：blocking 只有 no_tiles / count / bad_group，其余都是 info", () => {
    const BLOCKING = new Set(["no_tiles", "count", "bad_group"]);
    // 每个 code 都要被下面的场景覆盖到，漏一个就说明清单和实现对不上
    const scenes: Detection[][] = [
      [],
      row([...CLOSED13.slice(0, 11), "9m~"], 10, 200).dets, // count + bad_group
      (() => {
        const d = row([...CLOSED13, "9m~"], 10, 200).dets;
        return [...d, { ...det("8p", 120, 120), box: [120, 120, 140, 176] } as Detection];
      })(), // odd_box
      row([...CLOSED13, "9m"], 10, 200).dets, // no_win_tile
      row(["1m~", "5p", "9s", ...CLOSED13.slice(3), "9m~"], 10, 200).dets, // multi_win
      (() => {
        const hand = row([...CLOSED13, "9m~"], 10, 400);
        return [...hand.dets, ...row(["1z", "2z", "3z", "4z", "5z", "6z"], 10, 100).dets];
      })(), // extra_rows
      (() => {
        const hand = row([...CLOSED13, "9m~"], 10, 400);
        return [
          ...hand.dets,
          ...row(["1z", "2z"], 30, 330).dets, // 里宝 2 张
          ...row(["6s"], 30, 250).dets, // 表宝 1 张
        ];
      })(), // too_many_dora
      (() => {
        const c = row(CLOSED13.slice(0, 10).concat("9m~"), 10, 400);
        return [
          ...c.dets,
          det("back", c.end + GAP, 400),
          det("5z", c.end + GAP + 42, 400),
          det("6z", c.end + GAP + 84, 400),
          det("back", c.end + GAP + 126, 400),
        ];
      })(), // kan_mismatch
      (() => {
        const c = row(CLOSED13.slice(0, 10).concat("9m~"), 10, 400);
        const kan = row(["5z", "5z~", "5z"], c.end + GAP, 400).dets;
        kan.push(det("back", c.end + GAP + 130, 400));
        return [...c.dets, ...kan];
      })(), // back_in_hand
    ];
    const seen = new Set<string>();
    for (const dets of scenes) {
      for (const w of layoutHand(dets).warnings) {
        seen.add(w.code);
        expect(w.severity).toBe(BLOCKING.has(w.code) ? "blocking" : "info");
      }
    }
    expect([...seen].sort()).toEqual([
      "back_in_hand",
      "bad_group",
      "count",
      "extra_rows",
      "kan_mismatch",
      "multi_win",
      "no_tiles",
      "no_win_tile",
      "odd_box",
      "too_many_dora",
    ]);
  });
});
