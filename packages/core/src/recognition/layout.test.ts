import { describe, expect, it } from "vitest";
import { AKA, TILE } from "../types/tiles";
import { RECOGNITION_CLASSES } from "./classes";
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

/** 一行连排，从 x0 开始；names 里以 `~` 结尾的横置。返回牌与行尾 x。 */
function row(names: string[], x0: number, y: number): { dets: Detection[]; end: number } {
  const dets: Detection[] = [];
  let x = x0;
  for (const n of names) {
    const side = n.endsWith("~");
    dets.push(det(side ? n.slice(0, -1) : n, x, y, { side }));
    x += (side ? H : W) + 2;
  }
  return { dets, end: x };
}

const GAP = 40; // 组间留空一张

describe("layoutHand", () => {
  it("13 张暗牌 + 横放和张（右端）+ 一张表宝牌", () => {
    const hand = row(
      ["1m", "2m", "3m", "4p", "0p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p", "9m~"],
      10,
      200,
    );
    const dora = row(["6s"], 10, 100);
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
    const dora = row(["6s", "3s"], 10, 100);
    const ura = row(["8p", "6s"], 10, 180);
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

  it("副露在下方一行、暗杠在上方一行；指示牌再往上", () => {
    const closed = row(["5m", "6m", "7m", "4s", "4s", "4s", "5s", "3s~"], 10, 300);
    const ankan = row(["back", "6z", "6z", "back"], 10, 210);
    const chi = row(["2s~", "3s", "4s"], 10, 380);
    const dora = row(["6s", "3s"], 60, 130);
    const ura = row(["8p", "6s"], 60, 60);
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

  it("竖拍（手机没转）：主轴判定后按列读", () => {
    // 把横排场景的 x/y 互换
    const hand = row(
      ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p", "9m~"],
      10,
      200,
    );
    const dora = row(["6s"], 10, 100);
    const swapped: Detection[] = [...hand.dets, ...dora.dets].map((d) => ({
      ...d,
      box: [d.box[1], d.box[0], d.box[3], d.box[2]],
    }));
    const { hand: h, warnings } = layoutHand(swapped);
    expect(warnings).toEqual([]);
    expect(h.winTile).toBe(TILE.M9);
    expect(h.closed).toHaveLength(14);
    expect(h.doraIndicators).toEqual([TILE.S6]);
  });

  it("倾斜的一行仍聚成一行", () => {
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
      "9m~",
    ];
    const dets = names.map((n, i) =>
      det(n.replace("~", ""), 10 + i * 42, 200 + i * 4, { side: n.endsWith("~") }),
    );
    const { hand: h, warnings } = layoutHand(dets);
    expect(warnings).toEqual([]);
    expect(h.closed).toHaveLength(14);
  });

  it("没有横放的和张：取末张并告警；多张横放：取末张并告警", () => {
    const a = layoutHand(
      row(
        ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p", "9m"],
        10,
        200,
      ).dets,
    );
    expect(a.warnings.map((w) => w.code)).toEqual(["no_win_tile"]);
    expect(a.hand.winTile).toBe(TILE.M9);
    const b = layoutHand(
      row(
        ["1m~", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p", "9m~"],
        10,
        200,
      ).dets,
    );
    expect(b.warnings.map((w) => w.code)).toEqual(["multi_win"]);
    expect(b.hand.winTile).toBe(TILE.M9);
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

  it("张数不对 → count；零检测 → no_tiles；低置信 → low_conf", () => {
    const twelve = row(
      ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "7m", "8m", "9m~"],
      10,
      200,
    );
    expect(layoutHand(twelve.dets).warnings.map((w) => w.code)).toContain("count");
    expect(layoutHand([]).warnings.map((w) => w.code)).toEqual(["no_tiles"]);
    const low = row(
      ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p", "9m~"],
      10,
      200,
    ).dets;
    low[0] = { ...low[0]!, conf: 0.3 };
    expect(layoutHand(low).warnings.map((w) => w.code)).toEqual(["low_conf"]);
  });

  it("裁剪没裁干净：上方多出的整齐一行（6 张）被忽略并告警；有牌背的行不当指示牌", () => {
    const hand = row(
      ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p", "9m~"],
      10,
      400,
    );
    const dora = row(["6s"], 10, 300);
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

  it("赤五按类名映射为 35/36/37", () => {
    const hand = row(
      ["0m", "0p", "0s", "4p", "5p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p", "9m~"],
      10,
      200,
    );
    const { hand: h } = layoutHand(hand.dets);
    expect(h.closed.slice(0, 3)).toEqual([AKA.M5, AKA.P5, AKA.S5]);
  });
});
