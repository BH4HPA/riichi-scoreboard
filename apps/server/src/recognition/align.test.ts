import { describe, expect, it } from "vitest";
import {
  AKA,
  layoutHand,
  RECOGNITION_CLASSES,
  TILE,
  type Detection,
  type HandInput,
  type Tile,
} from "@riichi/core";
import { align } from "./align";

const W = 40;
const H = 56;

function det(name: string, x: number, y: number, side = false): Detection {
  const cls = RECOGNITION_CLASSES.indexOf(name);
  if (cls < 0) throw new Error(name);
  const [w, h] = side ? [H, W] : [W, H];
  return { cls, conf: 0.95, box: [x, y, x + w, y + h] };
}

function row(names: string[], x0: number, y: number): { dets: Detection[]; end: number } {
  const dets: Detection[] = [];
  let x = x0;
  for (const n of names) {
    const side = n.endsWith("~");
    dets.push(det(side ? n.slice(0, -1) : n, x, y, side));
    x += (side ? H : W) + 2;
  }
  return { dets, end: x };
}

/** 13 张暗牌 + 横放和张 + 一张表宝牌，合计 14 张，布局零告警 */
const NAMES = ["1m", "2m", "3m", "4p", "0p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p"];
const hand = row([...NAMES, "9m~"], 10, 200);
const dora = row(["6s"], 30, 100);
const DETS = [...hand.dets, ...dora.dets];

const emptyHand = (closed: Tile[], doraIndicators: Tile[]): HandInput => ({
  closed,
  melds: [],
  winTile: TILE.M9,
  tsumo: false,
  doraIndicators,
  uraIndicators: [],
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  afterKan: false,
  lastTile: false,
  firstTake: false,
});

const base = layoutHand(DETS);
const clsOf = (labels: { cls: number }[], i: number) => RECOGNITION_CLASSES[labels[i]!.cls];

describe("align", () => {
  it("用户没改：每个框保留模型自己的类，整条自动入库", () => {
    const out = align(DETS, base.hand, emptyHand([...base.hand.closed], [TILE.S6]));
    expect(out.status).toBe("auto");
    expect(out.labels).toHaveLength(DETS.length);
    expect(out.labels.map((l) => l.cls)).toEqual(DETS.map((d) => d.cls));
  });

  it("用户改了一张：只有那个框被重标", () => {
    const closed = [...base.hand.closed];
    const i = closed.indexOf(TILE.M1);
    closed[i] = TILE.S3;
    const out = align(DETS, base.hand, emptyHand(closed, [TILE.S6]));
    expect(out.status).toBe("auto");
    const changed = out.labels.filter((l, k) => l.cls !== DETS[k]!.cls);
    expect(changed).toHaveLength(1);
    expect(RECOGNITION_CLASSES[changed[0]!.cls]).toBe("3s");
  });

  it("赤五改成普通五 → 送人工：可能是房间规则折回（该留 0p），也可能是纠正认错（该标 5p），分不开", () => {
    const closed = base.hand.closed.map((t) => (t === AKA.P5 ? TILE.P5 : t));
    const out = align(DETS, base.hand, emptyHand(closed, [TILE.S6]));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("赤五改成了普通五");
    // 预标注保持模型原判，交给人定
    expect(out.labels.map((l) => l.cls)).toEqual(DETS.map((d) => d.cls));
  });

  it("用户删掉混进指示牌行的误检 → 送人工，且不能把那个框改标成真牌（实拍遇到过）", () => {
    // 牌背被认成白板，混进了指示牌行，排在真宝牌前面
    const spurious = [...DETS, det("5z", 80, 100)];
    const b = layoutHand(spurious);
    expect(b.hand.doraIndicators).toHaveLength(2);
    // 用户在编辑态把白板那张删了，只留真宝牌
    const kept = b.hand.doraIndicators.filter((t) => t !== TILE.Haku);
    expect(kept).toHaveLength(1);
    const out = align(spurious, b.hand, emptyHand([...b.hand.closed], kept));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("指示牌张数对不上");
    // 关键：白板那个框必须原样保留，绝不能顶着后面那张真牌的类
    expect(out.labels.map((l) => l.cls)).toEqual(spurious.map((d) => d.cls));
    const haku = RECOGNITION_CLASSES.indexOf("5z");
    expect(out.labels.filter((l) => l.cls === haku)).toHaveLength(1);
  });

  it("指示牌被村规截断 → 也送人工：被截掉的那几张用户根本没在界面上见过", () => {
    const twoDora = [...DETS, det("1z", 80, 100)];
    const b = layoutHand(twoDora);
    const out = align(twoDora, b.hand, emptyHand([...b.hand.closed], [b.hand.doraIndicators[0]!]));
    expect(out.status).toBe("manual");
    expect(out.labels.map((l) => l.cls)).toEqual(twoDora.map((d) => d.cls));
  });

  it("用户补了一张模型没认出来的指示牌 → 送人工：照片里那张牌没有框，会被学成背景", () => {
    const out = align(DETS, base.hand, {
      ...emptyHand([...base.hand.closed], [TILE.S6]),
      uraIndicators: [TILE.M6],
    });
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("指示牌张数对不上");
  });

  it("编辑态删一张再补一张 → 下标整体错位，必须送人工（照单全收会把十几个框全标错）", () => {
    // TileKeyboard 的语义：removeClosed 把后面的牌整体左移，tap 追加到末尾
    const closed = [...base.hand.closed];
    closed.splice(2, 1);
    closed.push(TILE.S3);
    expect(closed).toHaveLength(base.hand.closed.length);
    const out = align(DETS, base.hand, emptyHand(closed, [TILE.S6]));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("错开");
    // 预标注保持模型原样，没有被改了一半
    expect(out.labels.map((l) => l.cls)).toEqual(DETS.map((d) => d.cls));
  });

  it("两张牌互换位置 → 无法判断谁是谁，送人工", () => {
    const closed = [...base.hand.closed];
    const [a, b] = [closed[0]!, closed[3]!];
    closed[0] = b;
    closed[3] = a;
    const out = align(DETS, base.hand, emptyHand(closed, [TILE.S6]));
    expect(out.status).toBe("manual");
  });

  it("把普通五改成赤五是真纠正，必须重标（规则只会把赤折成普通，不会反过来）", () => {
    // 模型认成普通 5p 的那种情形：用 5p 版本的检测框重跑
    const plain = DETS.map((d) =>
      RECOGNITION_CLASSES[d.cls] === "0p" ? { ...d, cls: RECOGNITION_CLASSES.indexOf("5p") } : d,
    );
    const b = layoutHand(plain);
    const closed = b.hand.closed.map((t) => (t === TILE.P5 ? AKA.P5 : t));
    const out = align(plain, b.hand, emptyHand(closed, [...b.hand.doraIndicators]));
    expect(out.status).toBe("auto");
    const i = plain.findIndex((d) => RECOGNITION_CLASSES[d.cls] === "5p");
    expect(clsOf(out.labels, i)).toBe("0p");
  });

  it("低置信度的误检框不阻止自动入库，也不产出标注：它不是牌", () => {
    // 0.3 低于 minConf 0.4，layoutHand 直接剔除（模型导出门槛是 0.25，这种框真会进记录）
    const stray = { ...det("5z", 600, 600), conf: 0.3 };
    const noisy = [...DETS, stray];
    const out = align(noisy, base.hand, emptyHand([...base.hand.closed], [TILE.S6]));
    expect(out.status).toBe("auto");
    expect(out.labels).toHaveLength(DETS.length);
    expect(out.labels.map((l) => l.box)).not.toContainEqual(stray.box);
  });

  it("送人工时误检框照旧带着：由人决定删不删", () => {
    const noisy = [...DETS, { ...det("5z", 600, 600), conf: 0.3 }];
    const out = align(noisy, base.hand, emptyHand(base.hand.closed.slice(0, 5), [TILE.S6]));
    expect(out.status).toBe("manual");
    expect(out.labels).toHaveLength(noisy.length);
  });

  it("里宝行比表宝行长 → 送人工：多半漏检了一张表宝牌，那张实物没有框", () => {
    const dets = [...hand.dets, ...row(["6s"], 30, 20).dets, ...row(["3m", "4m"], 30, 110).dets];
    const b = layoutHand(dets);
    expect(b.hand.doraIndicators).toEqual([TILE.S6]);
    expect(b.hand.uraIndicators).toEqual([TILE.M3, TILE.M4]);
    const out = align(dets, b.hand, {
      ...emptyHand([...b.hand.closed], [...b.hand.doraIndicators]),
      uraIndicators: [...b.hand.uraIndicators],
    });
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("表里指示牌张数不等");
  });

  it("同牌连排的末尾被改 → 送人工：和「删掉前面一张再补一张」分不开，该重标的框不同", () => {
    // 暗牌末尾 2p 2p 2p（和张横放）：删掉倒数第二张再补 3p，和直接把和张改成 3p 在数据上一模一样
    const names = [
      "1m",
      "2m",
      "3m",
      "4p",
      "5p",
      "6p",
      "7s",
      "8s",
      "9s",
      "7m",
      "8m",
      "2p",
      "2p",
      "2p~",
    ];
    const dets = [...row(names, 10, 200).dets, ...dora.dets];
    const b = layoutHand(dets);
    const closed = [...b.hand.closed];
    closed[closed.length - 1] = TILE.P3;
    const out = align(dets, b.hand, emptyHand(closed, [TILE.S6]));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("同一张牌连排");
  });

  it("用户增删过牌 → 位置对不上，送人工", () => {
    const out = align(DETS, base.hand, emptyHand(base.hand.closed.slice(0, 5), [TILE.S6]));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("增删");
  });

  it("有框没被布局采信 → 送人工：那张牌在照片里却没标注，YOLO 会把它学成背景", () => {
    // 远处一张没人要的牌：既不在手牌行也不在指示牌行
    const stray = [...DETS, det("5z", 600, 600)];
    const b = layoutHand(stray);
    const out = align(stray, b.hand, emptyHand([...b.hand.closed], [...b.hand.doraIndicators]));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("既没被采信也不算误检");
    // 送人工也带预标注，人只要改错的那几个
    expect(out.labels).toHaveLength(stray.length);
  });

  it("模型或布局规则改版导致结果对不上 → 送人工", () => {
    const stale = { ...base.hand, closed: [...base.hand.closed].reverse() };
    const out = align(DETS, stale, emptyHand([...base.hand.closed], [TILE.S6]));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("改版");
  });

  describe("暗杠", () => {
    const closed11 = row(
      ["1m", "2m", "3m", "4p", "6p", "7s", "8s", "9s", "7m", "8m", "9m~"],
      10,
      400,
    );
    const x = closed11.end + 40;
    const ankanOf = (mid: [Detection, Detection]) => [
      ...closed11.dets,
      det("back", x, 400),
      ...mid,
      det("back", x + 126, 400),
    ];
    const withMelds = (b: ReturnType<typeof layoutHand>, tiles: Tile[]): HandInput => ({
      ...emptyHand([...b.hand.closed], [...b.hand.doraIndicators]),
      melds: [{ open: false, tiles }],
    });

    it("普通暗杠照单确认 → 自动入库：补出来的首尾没被猜过，闸门不能把所有暗杠都拦下", () => {
      const dets = ankanOf([det("5z", x + 42, 400), det("5z", x + 84, 400)]);
      const b = layoutHand(dets);
      expect(align(dets, b.hand, withMelds(b, [...b.hand.melds[0]!.tiles])).status).toBe("auto");
    });

    it("中间两张都认成赤、实际只有一张 → 不管用户挪红标还是照单确认，都送人工", () => {
      const dets = ankanOf([det("0p", x + 42, 400), det("0p", x + 84, 400)]);
      const b = layoutHand(dets);
      expect(b.hand.melds[0]!.tiles).toEqual([TILE.P5, AKA.P5, AKA.P5, TILE.P5]);
      // 以前「赤→普通」一律当规则折返保留原判，这两种都会带着一个错的 0p 框进 auto
      for (const tiles of [
        [TILE.P5, TILE.P5, AKA.P5, TILE.P5], // 用户把红标挪到右边那张
        [TILE.P5, AKA.P5, TILE.P5, TILE.P5], // 照单确认 applyRecognized 按赤 3 裁过的结果
      ]) {
        const out = align(dets, b.hand, withMelds(b, tiles));
        expect(out.status).toBe("manual");
        expect(out.reason).toContain("赤五改成了普通五");
      }
    });

    it("中间两张不一致、照单确认 → 送人工：被弃用的那个框会带着模型原判进 auto", () => {
      const dets = ankanOf([
        { ...det("6z", x + 42, 400), conf: 0.6 },
        { ...det("7z", x + 84, 400), conf: 0.9 },
      ]);
      const b = layoutHand(dets);
      expect(b.hand.melds[0]!.tiles).toEqual([TILE.Chun, TILE.Chun, TILE.Chun, TILE.Chun]);
      const out = align(dets, b.hand, withMelds(b, [...b.hand.melds[0]!.tiles]));
      expect(out.status).toBe("manual");
      expect(out.reason).toContain("布局猜过的牌");
    });
  });

  it("用户改了暗杠里补出来的那张（没有对应的框）→ 送人工", () => {
    const closed11 = row(NAMES.slice(0, 10).concat("9m~"), 10, 400);
    const ankan = [
      det("back", closed11.end + 40, 400),
      det("5z", closed11.end + 82, 400),
      det("5z", closed11.end + 124, 400),
      det("back", closed11.end + 166, 400),
    ];
    const dets = [...closed11.dets, ...ankan];
    const b = layoutHand(dets);
    expect(b.hand.melds[0]!.tiles).toHaveLength(4);
    const corrected: HandInput = {
      ...emptyHand([...b.hand.closed], [...b.hand.doraIndicators]),
      melds: [{ open: false, tiles: [TILE.Hatsu, TILE.Hatsu, TILE.Hatsu, TILE.Hatsu] }],
    };
    const out = align(dets, b.hand, corrected);
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("没有检测框");
  });
});
