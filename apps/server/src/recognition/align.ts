import {
  baseTile,
  isAka,
  layoutHand,
  RECOGNITION_CLASSES,
  tileOfClassId,
  type Detection,
  type HandInput,
  type Meld,
  type RecognizedHand,
  type Tile,
  type TileOrigin,
} from "@riichi/core";

/** 牌 → 类 id。类目录是真源，按 tileOfClassId 反查，不再写一份名字表。 */
const CLASS_OF_TILE = new Map<Tile, number>();
RECOGNITION_CLASSES.forEach((_, cls) => {
  const tile = tileOfClassId(cls);
  if (tile !== null && !CLASS_OF_TILE.has(tile)) CLASS_OF_TILE.set(tile, cls);
});

export interface Label {
  cls: number;
  box: Detection["box"];
}

export interface Aligned {
  labels: Label[];
  /** auto = 可直接入训练集；manual = 带预标注送人工 */
  status: "auto" | "manual";
  reason: string;
}

/** keep = 保留模型原来的判断；数字 = 改成这个类；null = 标不出来 */
type Resolution = "keep" | number | null;

/**
 * 逐位比对模型认的牌与用户改正的牌，决定这个框最终该标什么：
 * - 牌没变 → 用户看过没动，模型原来那个类就是对的。
 * - 只有赤五标记变了（基础牌相同）→ 是房间规则把赤五折回了普通五（applyRecognized 干的），
 *   不是模型认错。**不能**按 corrected 改，否则会把照片里的赤五标成普通五。
 * - 基础牌变了 → 模型认错，按 corrected 重标；没有对应的框（暗杠补出来的那几张）就标不了。
 */
export function resolve(origin: TileOrigin, predicted: Tile, truth: Tile): Resolution {
  if (predicted === truth) return "keep";
  if (baseTile(predicted) === baseTile(truth) && isAka(predicted) !== isAka(truth)) return "keep";
  if (origin.det < 0) return null;
  return CLASS_OF_TILE.get(truth) ?? null;
}

const sameShape = (a: readonly Meld[], b: readonly Meld[]): boolean =>
  a.length === b.length && a.every((m, i) => m.tiles.length === b[i]!.tiles.length);

/**
 * 把用户改正后的牌写回检测框。对齐只有 layoutHand 知道位置映射，所以放在 TS 侧做，
 * Python 只负责拉照片与写文件。
 *
 * 只有**严格对齐**的记录才标成 auto：位置一一对应，且每个检测框都被布局采信。
 * 后一条是关键——只要有一个框没被采信，照片里就存在一个没标注的牌面对象，
 * YOLO 会把那种东西学成背景。宁可送人工。
 */
export function align(
  detections: Detection[],
  recognized: RecognizedHand,
  corrected: HandInput,
): Aligned {
  const { hand, provenance } = layoutHand(detections);
  // 预标注：每个框先按模型自己的类走，再按 corrected 逐位纠正
  const labels: Label[] = detections.map((d) => ({ cls: d.cls, box: d.box }));
  const manual = (reason: string): Aligned => ({ labels, status: "manual", reason });

  if (JSON.stringify(hand) !== JSON.stringify(recognized)) {
    return manual("布局结果与当初记录的不一致（模型或布局规则已改版）");
  }
  if (hand.closed.length !== corrected.closed.length || !sameShape(hand.melds, corrected.melds)) {
    return manual("用户增删过牌，位置对不上");
  }
  const used = new Set(provenance.usedDetections);
  if (used.size !== detections.length) {
    return manual(`${detections.length - used.size} 个框没被布局采信`);
  }

  const pairs: Array<[TileOrigin, Tile, Tile]> = [];
  hand.closed.forEach((t, i) => pairs.push([provenance.closed[i]!, t, corrected.closed[i]!]));
  hand.melds.forEach((m, i) =>
    m.tiles.forEach((t, j) =>
      pairs.push([provenance.melds[i]![j]!, t, corrected.melds[i]!.tiles[j]!]),
    ),
  );
  // 指示牌可能被房间规则截断（不开杠宝、无里宝），只比两边都有的部分；被截掉的保留模型的判断
  const row = (a: readonly Tile[], b: readonly Tile[], origins: readonly TileOrigin[]) =>
    a.slice(0, Math.min(a.length, b.length)).forEach((t, i) => pairs.push([origins[i]!, t, b[i]!]));
  row(hand.doraIndicators, corrected.doraIndicators, provenance.doraIndicators);
  row(hand.uraIndicators, corrected.uraIndicators, provenance.uraIndicators);

  for (const [origin, predicted, truth] of pairs) {
    const r = resolve(origin, predicted, truth);
    if (r === null) return manual("用户改了一张没有检测框的牌（暗杠里补出来的那几张）");
    if (r !== "keep") labels[origin.det]!.cls = r;
  }
  return { labels, status: "auto", reason: "" };
}
