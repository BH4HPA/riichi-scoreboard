import { describe, expect, it } from "vitest";
import {
  AKA,
  MLEAGUE_RULES,
  TILE,
  type Detection,
  type HandProvenance,
  type RecognitionResult,
  type RoomRules,
} from "@riichi/core";
import { locKey } from "../hand/tileLoc";
import { createValueDraft } from "../settlement/valueDraft";
import { applyRecognized } from "./applyRecognized";

const box = (n: number): Detection["box"] => [n, 0, n + 40, 56];
/** 与下面 hand 逐位对应的框：赤5筒（下标 1）置信度低，明杠里的 5索（下标 3）也低。 */
const detections: Detection[] = [0.9, 0.42, 0.9, 0.44, 0.9, 0.9, 0.9, 0.9, 0.9].map((conf, i) => ({
  cls: 0,
  conf,
  box: box(i * 42),
}));

const provenance: HandProvenance = {
  closed: [0, 1, 2].map((det) => ({ det, guessed: false })),
  melds: [[3, 4, 5].map((det) => ({ det, guessed: false }))],
  doraIndicators: [6, 7].map((det) => ({ det, guessed: false })),
  uraIndicators: [{ det: 8, guessed: false }],
  usedDetections: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  rejectedDetections: [],
};

const result: RecognitionResult = {
  modelId: "m",
  ms: 812,
  detections,
  hand: {
    closed: [TILE.M1, AKA.P5, TILE.M9],
    melds: [{ open: true, tiles: [AKA.S5, TILE.S6, TILE.S7] }],
    winTile: TILE.M9,
    doraIndicators: [TILE.S6, TILE.S3],
    uraIndicators: [TILE.P8],
  },
  warnings: [{ code: "count", message: "x", severity: "blocking" }],
  provenance,
};

describe("applyRecognized", () => {
  it("切到牌面模式、替换牌、清空评估；旗标保留；认出里宝即勾选立直并提示", () => {
    const draft = { ...createValueDraft(true, "manual"), evaluated: null };
    draft.hand.afterKan = true;
    const next = applyRecognized(draft, result, MLEAGUE_RULES, "k1");
    expect(next.mode).toBe("hand");
    expect(next.hand.closed).toEqual([TILE.M1, AKA.P5, TILE.M9]);
    expect(next.hand.melds[0]!.tiles).toEqual([AKA.S5, TILE.S6, TILE.S7]);
    expect(next.hand.tsumo).toBe(true);
    expect(next.hand.afterKan).toBe(true);
    expect(next.hand.doraIndicators).toEqual([TILE.S6, TILE.S3]);
    expect(next.hand.uraIndicators).toEqual([TILE.P8]);
    expect(next.hand.riichi).toBe(true);
    expect(next.evaluated).toBeNull();
    expect(next.recognition).toMatchObject({ key: "k1", id: null, ms: 812 });
    expect(next.recognition!.warnings.map((w) => w.code)).toEqual(["count", "extra_rows"]);
  });

  it("已勾立直时里宝照常保留，不重复提示", () => {
    const draft = createValueDraft(false, "manual");
    draft.hand.riichi = true;
    const next = applyRecognized(draft, result, MLEAGUE_RULES, "k2");
    expect(next.hand.uraIndicators).toEqual([TILE.P8]);
    expect(next.recognition!.warnings.map((w) => w.code)).toEqual(["count"]);
  });

  it("不用赤五、不开杠宝、无里宝的规则：赤五折回、宝牌截到 1 张、里宝丢弃并提示", () => {
    const rules: RoomRules = {
      ...MLEAGUE_RULES,
      hand: { ...MLEAGUE_RULES.hand, akaCount: 0, kanDora: false, uraDora: false },
    };
    const next = applyRecognized(createValueDraft(false, "manual"), result, rules, "k3");
    expect(next.hand.closed).toEqual([TILE.M1, TILE.P5, TILE.M9]);
    expect(next.hand.melds[0]!.tiles[0]).toBe(TILE.S5);
    expect(next.hand.doraIndicators).toEqual([TILE.S6]);
    expect(next.hand.uraIndicators).toEqual([]);
    expect(next.hand.riichi).toBe(false);
    expect(next.recognition!.warnings.map((w) => w.code)).toEqual([
      "count",
      "too_many_dora",
      "extra_rows",
    ]);
  });

  it("没把握的位置降解成坐标；规则截掉的指示牌不留下悬空记号", () => {
    const next = applyRecognized(createValueDraft(false, "manual"), result, MLEAGUE_RULES, "k4");
    // 置信度 0.42 的暗牌第 2 张、0.44 的副露第 1 张
    expect(next.recognition!.uncertain.map(locKey)).toEqual(["closed:1", "meld:0:0"]);
  });

  /** 置信度全高：记号只可能来自赤五裁剪，断言可以写精确 */
  const sure = detections.map((d) => ({ ...d, conf: 0.9 }));
  const withAka = (r: RecognitionResult, akaCount: 0 | 3 | 4) =>
    applyRecognized(
      createValueDraft(false, "manual"),
      { ...r, detections: sure },
      { ...MLEAGUE_RULES, hand: { ...MLEAGUE_RULES.hand, akaCount } },
      "k",
    );

  it("赤五超出每色上限：折回普通五，该花色的赤五全部标成要核对；赤 0 全折不打记号", () => {
    // 暗牌里已有一张赤五筒，暗杠中间两张又都认成了赤（布局照实记两张）
    const ankan: RecognitionResult = {
      ...result,
      hand: {
        ...result.hand,
        melds: [{ open: false, tiles: [TILE.P5, AKA.P5, AKA.P5, TILE.P5] }],
      },
      provenance: { ...provenance, melds: [[0, 1, 2, 3].map(() => ({ det: -1, guessed: false }))] },
    };

    // 赤 3：五筒只容一张。留下哪张只是合法的默认值，三张都标 —— 留下的那张也可能是认错的
    const aka3 = withAka(ankan, 3);
    expect(aka3.hand.closed).toEqual([TILE.M1, AKA.P5, TILE.M9]);
    expect(aka3.hand.melds[0]!.tiles).toEqual([TILE.P5, TILE.P5, TILE.P5, TILE.P5]);
    expect(aka3.recognition!.uncertain.map(locKey)).toEqual(["closed:1", "meld:0:1", "meld:0:2"]);

    // 赤 4：五筒容两张，只折最后那张，但同样超额，三张都标
    const aka4 = withAka(ankan, 4);
    expect(aka4.hand.melds[0]!.tiles).toEqual([TILE.P5, AKA.P5, TILE.P5, TILE.P5]);
    expect(aka4.recognition!.uncertain.map(locKey)).toEqual(["closed:1", "meld:0:1", "meld:0:2"]);

    // 赤 0：全折，但这是规则不算、不是认错，不打记号
    const aka0 = withAka(ankan, 0);
    expect(aka0.hand.closed).toEqual([TILE.M1, TILE.P5, TILE.M9]);
    expect(aka0.hand.melds[0]!.tiles).toEqual([TILE.P5, TILE.P5, TILE.P5, TILE.P5]);
    expect(aka0.recognition!.uncertain).toEqual([]);
  });

  it("和张按位置取：暗牌两张赤五、末尾的和张被折回时，和张记号不能跳到前面那张赤五上", () => {
    // 布局把和张放在暗牌末尾
    const twoAka: RecognitionResult = {
      ...result,
      hand: { ...result.hand, closed: [TILE.M1, AKA.P5, AKA.P5], winTile: AKA.P5 },
    };
    for (const akaCount of [3, 0] as const) {
      const next = withAka(twoAka, akaCount);
      expect(next.hand.closed).toEqual([TILE.M1, akaCount ? AKA.P5 : TILE.P5, TILE.P5]);
      expect(next.hand.winTile).toBe(TILE.P5);
      expect(next.hand.closed.lastIndexOf(next.hand.winTile)).toBe(2);
    }
    expect(withAka(twoAka, 3).recognition!.uncertain.map(locKey)).toEqual(["closed:1", "closed:2"]);
  });

  it("截断后越界的记号被丢掉", () => {
    const shaky: RecognitionResult = {
      ...result,
      provenance: {
        ...provenance,
        // 表宝第 2 张（会被 kanDora:false 截掉）与里宝（无里宝规则会清空）都标成猜的
        doraIndicators: [
          { det: 6, guessed: false },
          { det: 7, guessed: true },
        ],
        uraIndicators: [{ det: 8, guessed: true }],
      },
    };
    const rules: RoomRules = {
      ...MLEAGUE_RULES,
      hand: { ...MLEAGUE_RULES.hand, kanDora: false, uraDora: false },
    };
    const next = applyRecognized(createValueDraft(false, "manual"), shaky, rules, "k5");
    expect(next.hand.doraIndicators).toHaveLength(1);
    expect(
      next.recognition!.uncertain.filter((l) => l.area !== "closed" && l.area !== "meld"),
    ).toEqual([]);
  });

  it("web 层 push 的提示一律是 info：只要有一条 blocking，确认态就永远收不起键盘", () => {
    const rules: RoomRules = {
      ...MLEAGUE_RULES,
      hand: { ...MLEAGUE_RULES.hand, kanDora: false, uraDora: false },
    };
    // 这三条分别覆盖 applyRecognized 里的三处 push（规则截断宝牌、无里宝、认出里宝勾立直）
    for (const [r, key] of [
      [rules, "s1"],
      [MLEAGUE_RULES, "s2"],
    ] as const) {
      const next = applyRecognized(createValueDraft(false, "manual"), result, r, key);
      const pushed = next.recognition!.warnings.filter((w) => w.code !== "count");
      expect(pushed.length).toBeGreaterThan(0);
      expect(pushed.every((w) => w.severity === "info")).toBe(true);
    }
  });

  it("识别里宝自动勾立直时标记 riichiAuto；新一次识别把 editing 复位", () => {
    const draft = { ...createValueDraft(true, "manual"), editing: true };
    const next = applyRecognized(draft, result, MLEAGUE_RULES, "k6");
    expect(next.riichiAuto).toBe(true);
    expect(next.editing).toBe(false);

    const already = { ...createValueDraft(false, "manual") };
    already.hand.riichi = true;
    expect(applyRecognized(already, result, MLEAGUE_RULES, "k7").riichiAuto).toBe(false);
  });
});
