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
 * - 牌变了 → 模型认错，按 corrected 重标；没有对应的框（暗杠补出来的那几张）就标不了。
 *   包括「普通五 → 赤五」：用户在替换面板里改成赤五是真纠正，必须重标。
 * 「赤五 → 普通五」到不了这里，在 align 里整条送人工（见那里的说明）。
 */
export function resolve(origin: TileOrigin, predicted: Tile, truth: Tile): Resolution {
  if (predicted === truth) return "keep";
  if (origin.det < 0) return null;
  return CLASS_OF_TILE.get(truth) ?? null;
}

const sameShape = (a: readonly Meld[], b: readonly Meld[]): boolean =>
  a.length === b.length && a.every((m, i) => m.tiles.length === b[i]!.tiles.length);

/**
 * 一手牌里每种牌各几张（赤五按精确码单独计）。
 */
function counts(tiles: readonly Tile[]): Map<Tile, number> {
  const m = new Map<Tile, number>();
  for (const t of tiles) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/**
 * 逐位比较是否**真的是逐位改牌**，而不是整体错位。
 *
 * 这是最要命的一条。编辑态的全键盘是「删一张 → 从末尾补一张」的语义
 * （TileKeyboard 的 removeClosed 会把后面的牌整体左移，tap 追加到末尾）。
 * 用户删掉认错的第 3 张再补回正确的那张之后，张数不变、副露形状不变、框也全被采信，
 * 但从第 3 张起每个位置都错开了一格 —— 照单全收就会把十几个框全标成右邻那张牌，
 * 而且没有任何人会去复核 auto 队列。
 *
 * 判据：**位置差异的个数必须等于多重集差异的个数**。
 * - 逐位改牌：改 k 张 → k 个位置不同，多重集也正好换掉 k 张 ⇒ 相等。
 * - 整体错位：十几个位置不同，多重集只换了一张 ⇒ 不等，降级人工。
 * - 两张牌互换位置：位置不同 2 个、多重集没变 ⇒ 不等，降级（这种情况本来也无法判断谁是谁）。
 */
function inPlace(pairs: ReadonlyArray<[unknown, Tile, Tile]>): boolean {
  const differing = pairs.filter(([, predicted, truth]) => predicted !== truth).length;
  const before = counts(pairs.map(([, predicted]) => predicted));
  const after = counts(pairs.map(([, , truth]) => truth));
  let changed = 0;
  for (const [tile, n] of before) changed += Math.max(0, n - (after.get(tile) ?? 0));
  return differing === changed;
}

/**
 * 把用户改正后的牌写回检测框。对齐只有 layoutHand 知道位置映射，所以放在 TS 侧做，
 * Python 只负责拉照片与写文件。
 *
 * 只有**严格对齐**的记录才标成 auto：改动确实是逐位替换（见 inPlace）、
 * 每个框要么被布局采信要么被判为误检、改到的位置都有对应的框，
 * 且没有「赤五改成普通五」、没有布局猜过的补牌（两者都分不清框该标什么）。
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
  /*
   * 指示牌的张数必须**两边完全相等**，多一张少一张都送人工。少一张有三种成因，
   * 从张数上根本分不开，而其中两种照单全收就会灌进错标注：
   * - 用户在编辑态删掉了一张误检（实拍遇到过：牌背被认成白板混进指示牌行）。
   *   若按「只比两边都有的部分」对齐，删的又是靠前那张，后面的真牌会顶上来，
   *   那个误检框就被改标成真牌的类 —— 一张照片里出现两个同类框，其中一个是牌背。
   * - 房间村规截断（不开杠宝只留 1 张、无里宝清空）。被截掉的那几张用户根本没在
   *   界面上见过，拿模型的预测当真值等于把没验证过的东西写进训练集。
   * - 多一张则说明模型漏检了：照片里有张牌没有任何框，YOLO 会把它学成背景。
   */
  if (
    hand.doraIndicators.length !== corrected.doraIndicators.length ||
    hand.uraIndicators.length !== corrected.uraIndicators.length
  ) {
    return manual("指示牌张数对不上（删掉了误检、被村规截断、或模型漏检）");
  }
  // 照片里每一张真牌都得有标注，否则 YOLO 会把没标的牌学成背景。
  // 但按噪声剔除的框（低置信、形状退化）不是牌，不标注才是对的，也不该因此降级。
  const accounted = new Set([...provenance.usedDetections, ...provenance.rejectedDetections]);
  if (accounted.size !== detections.length) {
    return manual(`${detections.length - accounted.size} 个框既没被采信也不算误检`);
  }

  const pairs: Array<[TileOrigin, Tile, Tile]> = [];
  hand.closed.forEach((t, i) => pairs.push([provenance.closed[i]!, t, corrected.closed[i]!]));
  hand.melds.forEach((m, i) =>
    m.tiles.forEach((t, j) =>
      pairs.push([provenance.melds[i]![j]!, t, corrected.melds[i]!.tiles[j]!]),
    ),
  );
  // 张数上面已经核过相等，这里逐位比
  const row = (a: readonly Tile[], b: readonly Tile[], origins: readonly TileOrigin[]) =>
    a.forEach((t, i) => pairs.push([origins[i]!, t, b[i]!]));
  row(hand.doraIndicators, corrected.doraIndicators, provenance.doraIndicators);
  row(hand.uraIndicators, corrected.uraIndicators, provenance.uraIndicators);

  if (!inPlace(pairs)) return manual("牌的位置整体错开了（编辑态删牌再补牌会这样）");
  /*
   * 「赤五 → 同一张普通五」有两种成因，从记录里分不开（recognitions 没存房间规则）：
   * - 不用赤五的房间，applyRecognized 把照片里的赤五折回了普通五 —— 照片里就是赤，该保留 0p；
   * - 用户在纠错，或 applyRecognized 按每色上限折掉了超额的赤五 —— 照片里是普通五，该重标。
   * 猜错任一边都是把错标签写进没人复核的 auto 队列，所以整条交给人。
   */
  if (pairs.some(([, p, t]) => isAka(p) && !isAka(t) && baseTile(p) === baseTile(t))) {
    return manual("赤五改成了普通五：分不清是房间规则折回还是纠正认错");
  }
  // 布局猜过的补出来的牌（暗杠中间两张不一致、白板杠里一张认成牌背）：落选或认错的那个框
  // 被采信了却没有对应位置，用户照单确认它也会带着模型原判进 auto（例如白板框标成 back）
  if (pairs.some(([o]) => o.det < 0 && o.guessed)) {
    return manual("布局猜过的牌（暗杠两张不一致、白板杠补齐）：落选或认错的那个框标不出来");
  }

  // 中途放弃时不能留下改了一半的标注：先在副本上写，全部通过再落地
  const fixed = labels.map((l) => ({ ...l }));
  for (const [origin, predicted, truth] of pairs) {
    const r = resolve(origin, predicted, truth);
    if (r === null) return manual("用户改了一张没有检测框的牌（暗杠里补出来的那几张）");
    if (r !== "keep") fixed[origin.det]!.cls = r;
  }
  return { labels: fixed, status: "auto", reason: "" };
}
