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

  it("赤五被房间规则折回普通五：不能按 corrected 改，否则会把照片里的赤五标成普通五", () => {
    const closed = base.hand.closed.map((t) => (t === AKA.P5 ? TILE.P5 : t));
    const out = align(DETS, base.hand, emptyHand(closed, [TILE.S6]));
    expect(out.status).toBe("auto");
    const akaIndex = DETS.findIndex((d) => RECOGNITION_CLASSES[d.cls] === "0p");
    expect(clsOf(out.labels, akaIndex)).toBe("0p");
  });

  it("指示牌被规则截掉：少的那几张保留模型的判断，不当成用户改动", () => {
    const twoDora = [...DETS, det("1z", 80, 100)];
    const b = layoutHand(twoDora);
    expect(b.hand.doraIndicators).toHaveLength(2);
    const out = align(twoDora, b.hand, emptyHand([...b.hand.closed], [b.hand.doraIndicators[0]!]));
    expect(out.status).toBe("auto");
    expect(out.labels.map((l) => l.cls)).toEqual(twoDora.map((d) => d.cls));
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
    expect(out.reason).toContain("没被布局采信");
    // 送人工也带预标注，人只要改错的那几个
    expect(out.labels).toHaveLength(stray.length);
  });

  it("模型或布局规则改版导致结果对不上 → 送人工", () => {
    const stale = { ...base.hand, closed: [...base.hand.closed].reverse() };
    const out = align(DETS, stale, emptyHand([...base.hand.closed], [TILE.S6]));
    expect(out.status).toBe("manual");
    expect(out.reason).toContain("改版");
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
