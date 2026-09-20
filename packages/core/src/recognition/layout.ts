import {
  akaOf,
  baseTile,
  isAka,
  isHonor,
  TILE,
  tileSuit,
  type Meld,
  type Tile,
} from "../types/tiles";
import { tileOfClassId } from "./classes";
import type {
  Detection,
  HandProvenance,
  RecognizedHand,
  RecognitionSeverity,
  RecognitionWarning,
  RecognitionWarningCode,
  TileOrigin,
} from "./types";

export interface LayoutOptions {
  /** 行聚类阈值：相邻框中心的纵向差超过 rowGap × 中位牌高 视为新行 */
  rowGap: number;
  /** 分组阈值：行内相邻框的横向间隙超过 groupGap × 中位牌宽 视为新组 */
  groupGap: number;
  /** 横置判定：框宽 > 框高 × sideAspect */
  sideAspect: number;
  /** 低于此置信度的牌由界面打记号提示核对（评估集里真牌最低 0.60，这条线已验证） */
  lowConf: number;
  /** 低于此置信度的框不参与布局（评估集里误检在 0.32–0.34，真牌最低 0.60） */
  minConf: number;
  /**
   * 调用方已知画面是正的（取景页按设备朝向转正过）：跳过「多数框宽 > 高 ⇒ 竖拍」的投票。
   * 整帧里侧着看的牌山、两侧玩家的牌河都是宽框，票数接近时会把正的画面误判成竖拍。
   */
  upright: boolean;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  rowGap: 0.6,
  groupGap: 0.5,
  // 正放的牌框比约 0.7–0.85，横置约 1.1–1.4（斜拍会压扁），取 1.0 分界
  sideAspect: 1.0,
  lowConf: 0.5,
  minConf: 0.4,
  upright: false,
};

/** 入参坐标系里的矩形 [x1, y1, x2, y2] */
export type Box = readonly [number, number, number, number];

/**
 * 手牌周围的窗口，单位是**手牌行**正放牌的中位牌高 H / 牌宽 W（不取全图中位数：远处牌河的牌更小，
 * 数量一多就会把窗口拉窄）。副露与指示牌只在窗口里找，窗口外的一律当牌河 / 牌山。
 * 数值来自线上实拍（2026-09-19，50 条）：被采信的指示牌行距手牌行中心最远 3.61H，表里两行之间 0.89–1.2H；
 * 评估集里副露摆在手牌下方的最远 2.8H。副露多的近拍里行是一层层摞上去的，所以按「逐跳」量而不是量到手牌行。
 */
export const HAND_WINDOW = {
  /** 一跳：副露行、第一行指示牌，距上一个已采信的行（手牌行或更近的副露行）的中心 */
  hop: 4,
  /** 第二行指示牌距第一行中心 */
  secondHop: 2,
  /** 左右留给还没认出来的副露 */
  side: 1.5,
} as const;

export interface LayoutResult {
  hand: RecognizedHand;
  warnings: RecognitionWarning[];
  provenance: HandProvenance;
  /**
   * 手牌可能占据的区域（入参坐标系）：取景据此裁出下一遍要识别的范围。
   * 只由手牌行的位置与尺度决定，不随指示牌有没有认出来伸缩，所以逐帧稳定。没有暗牌组时为 null。
   */
  window: Box | null;
}

const MAX_MELDS = 4;
/** 「这个方向不设边」：调用方会把窗口夹进画面 */
const FAR = 1e9;
const MAX_INDICATORS = 5;

/** 补出来的牌（暗杠只露中间两张、杠里一张认成牌背）没有对应的框 */
const NO_DET = -1;

interface Item {
  det: Detection;
  /** det 在入参 detections 里的下标，用于回填来源 */
  detIndex: number;
  /** null = 牌背 */
  tile: Tile | null;
  cx: number;
  cy: number;
  w: number;
  h: number;
  side: boolean;
}

const originOf = (i: Item, guessed = false): TileOrigin => ({ det: i.detIndex, guessed });
const synthetic = (guessed: boolean): TileOrigin => ({ det: NO_DET, guessed });

interface Row {
  cy: number;
  groups: Item[][];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** 通过置信度与面积筛选后保留下来的框，带着它在入参里的下标 */
interface Kept {
  det: Detection;
  detIndex: number;
}

/** 主轴：正放的牌是竖长的；照片里多数框「宽 > 高」说明手机竖拍没转，交换坐标按列读。 */
function isPortrait(kept: readonly Kept[]): boolean {
  const wide = kept.filter(({ det: d }) => d.box[2] - d.box[0] > d.box[3] - d.box[1]).length;
  return wide > kept.length - wide;
}

function toItems(kept: readonly Kept[], swap: boolean, sideAspect: number): Item[] {
  return kept.map(({ det, detIndex }) => {
    const [x1, y1, x2, y2] = det.box;
    const w0 = x2 - x1;
    const h0 = y2 - y1;
    const [cx, cy, w, h] = swap
      ? [(y1 + y2) / 2, (x1 + x2) / 2, h0, w0]
      : [(x1 + x2) / 2, (y1 + y2) / 2, w0, h0];
    return { det, detIndex, tile: tileOfClassId(det.cls), cx, cy, w, h, side: w > h * sideAspect };
  });
}

/** 按 cy 聚成行：相邻框中心差超过 gap 起新行（对轻微倾斜鲁棒，因为比较的是相邻框而不是行首）。 */
function clusterRows(items: Item[], gap: number): Item[][] {
  const sorted = [...items].sort((a, b) => a.cy - b.cy);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && it.cy - row[row.length - 1]!.cy <= gap) row.push(it);
    else rows.push([it]);
  }
  return rows;
}

/** 行内按 cx 排序，横向间隙超过 gap 切组。 */
function splitGroups(row: Item[], gap: number): Item[][] {
  const sorted = [...row].sort((a, b) => a.cx - b.cx);
  const groups: Item[][] = [];
  for (const it of sorted) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (g && prev && it.cx - it.w / 2 - (prev.cx + prev.w / 2) <= gap) g.push(it);
    else groups.push([it]);
  }
  return groups;
}

/** 暗杠：牌背-X-X-牌背，中间两张同牌（字牌之间的误识别如 發/中 放行，后面报 kan_mismatch 取置信度高的） */
function isAnkan(g: Item[]): boolean {
  if (g.length !== 4 || g[0]!.tile !== null || g[3]!.tile !== null) return false;
  const [a, b] = [g[1]!.tile, g[2]!.tile];
  if (a === null || b === null) return false;
  return baseTile(a) === baseTile(b) || (isHonor(a) && isHonor(b));
}

/**
 * 副露段：暗杠（牌背-X-X-牌背），或 3/4 张牌面含横置且牌型合法（碰三同、杠四同、吃同色顺子）。
 * 吃/碰恰一张横置；杠允许两张（加杠的实际摆法是加的那张横着叠在横置牌上）。
 */
function isMeldSegment(g: Item[]): boolean {
  if (isAnkan(g)) return true;
  if (g.length !== 3 && g.length !== 4) return false;
  const faces = g.filter((i) => i.tile !== null);
  const sides = g.filter((i) => i.side).length;
  const bases = faces.map((i) => baseTile(i.tile!)).sort((a, b) => a - b);
  // 白板的杠允许一张牌背：白板是空白面，模型偶尔把它认成牌背；别的牌旁边的牌背只能是误检
  if (faces.length < g.length) {
    return (
      g.length === 4 && faces.length === 3 && bases.every((b) => b === TILE.Haku) && sides <= 2
    );
  }
  if (bases.every((b) => b === bases[0])) return sides === 1 || (g.length === 4 && sides === 2);
  if (g.length !== 3 || sides !== 1 || isHonor(bases[0]!)) return false;
  return (
    tileSuit(bases[0]!) === tileSuit(bases[2]!) &&
    bases[1] === bases[0]! + 1 &&
    bases[2] === bases[0]! + 2
  );
}

/** 暗牌段：3n+2 张牌面，至多一张横置（和张）。 */
function isClosedSegment(g: Item[]): boolean {
  return (
    g.length % 3 === 2 && g.every((i) => i.tile !== null) && g.filter((i) => i.side).length <= 1
  );
}

interface Partition {
  closed: Item[] | null;
  melds: Item[][];
  /** 被剔除的零星牌背（误检或桌上的杂物） */
  dropped: number;
}

/**
 * 明杠/加杠的第四张是横着叠在横置牌上面的，框中心比同组其他牌高出约一张牌宽（实拍 0.85–1.05 倍横置框高），
 * 会被聚成单独一行。同一种牌的两张横置框横向重叠、纵向相距不超过 1.1 倍框高、且其中一张身边没有正放牌
 * （叠在上面的那张是孤立的；相邻两行各自的横置牌旁边都有同行的正放牌）时视为叠放，把两张的 cy 归到中点。
 */
function mergeStacked(items: Item[], medW: number, medH: number): void {
  const upright = items.filter((i) => !i.side);
  const alone = (s: Item) =>
    !upright.some((u) => Math.abs(u.cx - s.cx) < 1.5 * medW && Math.abs(u.cy - s.cy) < 0.3 * medH);
  const sides = items.filter((i) => i.side && i.tile !== null);
  for (const a of sides) {
    for (const b of sides) {
      if (a === b || baseTile(a.tile!) !== baseTile(b.tile!)) continue;
      const dy = Math.abs(a.cy - b.cy);
      if (dy === 0 || dy > 1.1 * Math.max(a.h, b.h)) continue;
      if (Math.abs(a.cx - b.cx) > 0.5 * Math.max(a.w, b.w)) continue;
      if (!alone(a) && !alone(b)) continue;
      a.cy = b.cy = (a.cy + b.cy) / 2;
    }
  }
}

/** 剔除不在副露形状里的牌背（暗杠的两端、明杠里认成牌背的白板）：模型偶尔把杂物认成牌背，留着会把暗牌切成两段。 */
function dropStrayBacks(g: Item[]): { items: Item[]; dropped: number } {
  const keep = new Set<Item>();
  for (let i = 0; i + 3 < g.length; i++) {
    const seg = g.slice(i, i + 4);
    if (isMeldSegment(seg)) seg.forEach((it) => keep.add(it));
  }
  const items = g.filter((it) => it.tile !== null || keep.has(it));
  return { items, dropped: g.length - items.length };
}

/**
 * 把一段连排的牌拆成 [副露…] [暗牌]? [副露…]：实拍里副露之间、副露与暗牌之间常常不留空，
 * 靠「每组副露含横置且牌型合法」切分。多解时取暗牌段最长、段数最少的；无解返回 null。
 */
function partition(raw: Item[]): Partition | null {
  const { items: g, dropped } = dropStrayBacks(raw);
  if (g.length === 0) return null;
  type Tail = { closed: Item[] | null; melds: Item[][] };
  const score = (t: Tail) => (t.closed?.length ?? 0) * 100 - t.melds.length;
  // 分数按段可加，所以从 (from, 是否已取暗牌段) 出发的最优后缀与前缀无关，可记忆化：
  // 不记忆的 DFS 在「300 张同种牌每三张一横」这类对抗输入上是指数级（PATCH 体最多 300 框）
  const memo: (Tail | null | undefined)[][] = [new Array(g.length + 1), new Array(g.length + 1)];
  const walk = (from: number, hasClosed: boolean): Tail | null => {
    const k = hasClosed ? 1 : 0;
    const hit = memo[k]![from];
    if (hit !== undefined) return hit;
    let best: Tail | null = from === g.length ? { closed: null, melds: [] } : null;
    const consider = (t: Tail) => {
      if (!best || score(t) > score(best)) best = t;
    };
    for (const size of [3, 4]) {
      const seg = g.slice(from, from + size);
      if (seg.length !== size || !isMeldSegment(seg)) continue;
      const rest = walk(from + size, hasClosed);
      if (rest) consider({ closed: rest.closed, melds: [seg, ...rest.melds] });
    }
    if (!hasClosed) {
      for (let size = 2; from + size <= g.length; size += 3) {
        const seg = g.slice(from, from + size);
        if (!isClosedSegment(seg)) continue;
        const rest = walk(from + size, true);
        if (rest) consider({ closed: seg, melds: rest.melds });
      }
    }
    memo[k]![from] = best;
    return best;
  };
  const t = walk(0, false);
  return t && { ...t, dropped };
}

function isCleanRow(items: Item[]): boolean {
  return items.length <= MAX_INDICATORS && items.every((i) => !i.side && i.tile !== null);
}

/**
 * 检测框 → 手牌。摆牌约定：
 * - 暗牌连排，和张横放接在任一端（同一组，不留空）；暗牌组含和张恒为 3n+2 张。
 * - 副露 3/4 张且含一张横置，或 牌背-X-X-牌背 的暗杠；放在手牌行右侧、下方或上方都行。
 * - 指示牌在手牌行上方，不含横置与牌背，每行 ≤5 张；两行时上表下里，一行全表。
 * - 照片可以带着牌河与牌山：手牌组取「暗牌 + 窗口内副露恰为 14 张」的那组，副露与指示牌只在
 *   `HAND_WINDOW` 里找，窗口外多出来的牌只报 `extra_rows`。
 * - 有里宝时表里张数必然相等：不等且远的那行更长，远行是牌河的末行；其余不等报 `indicator_mismatch`。
 * 前提：detections 的 cls 已在类目录范围内（decodeNmsOutput / validate 都保证）。
 * 不抛错：能拼多少拼多少，问题写进 warnings，交编辑器让用户改。
 */
export function layoutHand(
  allDetections: readonly Detection[],
  options: Partial<LayoutOptions> = {},
): LayoutResult {
  const opts = { ...DEFAULT_LAYOUT, ...options };
  // 与 decodeNmsOutput 同一约定，只收正面积的框：零面积框会让宽高比中位数变 NaN、把所有框滤光
  const kept: Kept[] = [];
  allDetections.forEach((det, detIndex) => {
    if (det.conf >= opts.minConf && det.box[2] > det.box[0] && det.box[3] > det.box[1])
      kept.push({ det, detIndex });
  });
  const warnings: RecognitionWarning[] = [];
  const warn = (code: RecognitionWarningCode, severity: RecognitionSeverity, message: string) =>
    warnings.push({ code, message, severity });
  const empty: RecognizedHand = {
    closed: [],
    melds: [],
    winTile: 0,
    doraIndicators: [],
    uraIndicators: [],
  };
  // 没通过硬门槛的框是误检，不是牌：记下来，回流时既不标注也不因此降级
  const rejected = new Set<number>();
  allDetections.forEach((_, i) => rejected.add(i));
  kept.forEach(({ detIndex }) => rejected.delete(detIndex));
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  if (kept.length === 0) {
    warn("no_tiles", "blocking", "照片里没有认出任何牌");
    return {
      hand: empty,
      warnings,
      provenance: {
        closed: [],
        melds: [],
        doraIndicators: [],
        uraIndicators: [],
        usedDetections: [],
        rejectedDetections: sorted(rejected),
      },
      window: null,
    };
  }

  const swap = !opts.upright && isPortrait(kept);
  // 牌是刚性的，同一行里正放牌的框比例高度一致；明显更窄的框是误检（残缺、杂物），剔除。
  // 按行比而不是全图比：侧着看的牌山、远处的牌河比例与手牌不同，混在一起算中位数会把手牌里正常的牌也判成异常
  const all = toItems(kept, swap, opts.sideAspect);
  const ratio = (i: Item) => i.w / i.h;
  const globalRef = median(all.filter((i) => !i.side).map(ratio));
  const roughH = median(all.filter((i) => !i.side).map((i) => i.h));
  const items = clusterRows(all, opts.rowGap * roughH).flatMap((row) => {
    const up = row.filter((i) => !i.side);
    const ref = up.length >= 3 ? median(up.map(ratio)) : globalRef;
    return row.filter((i) => i.side || ratio(i) >= 0.85 * ref);
  });
  if (items.length < all.length) {
    warn("odd_box", "info", `${all.length - items.length} 个检测框形状异常，已忽略`);
    const keptItems = new Set(items);
    all.forEach((i) => !keptItems.has(i) && rejected.add(i.detIndex));
  }
  const upright = items.filter((i) => !i.side);
  const medH = median((upright.length ? upright : items).map((i) => i.h));
  const medW = median((upright.length ? upright : items).map((i) => i.w));
  mergeStacked(items, medW, medH);
  const rows: Row[] = clusterRows(items, opts.rowGap * medH).map((r) => ({
    cy: r.reduce((s, i) => s + i.cy, 0) / r.length,
    groups: splitGroups(r, opts.groupGap * medW),
  }));

  // 每组先尝试拆成 副露…/暗牌/副露…（实拍常不留空）。拆不开的组原样保留，交给后面的兜底与指示牌判定。
  const parts = new Map<Item[], Partition>();
  for (const row of rows) {
    for (const g of row.groups) {
      const p = partition(g);
      if (p) parts.set(g, p);
    }
  }
  const isPureMelds = (g: Item[]) => {
    const p = parts.get(g);
    return !!p && p.closed === null && p.melds.length > 0;
  };
  const hasSide = (seg: Item[]) => seg.some((i) => i.side && i.tile !== null);
  const rowOf = new Map<Item[], Row>();
  for (const row of rows) for (const g of row.groups) rowOf.set(g, row);
  /** 以某个暗牌段为准的牌高 / 牌宽：窗口的尺子 */
  const scaleOf = (seg: Item[]) => {
    const up = seg.filter((i) => !i.side);
    return up.length > 0
      ? { h: median(up.map((i) => i.h)), w: median(up.map((i) => i.w)) }
      : { h: medH, w: medW };
  };
  /** 从手牌行往一侧逐行走出去的行序 */
  const outward = (hand: Row, dir: -1 | 1) =>
    rows
      .filter((r) => r !== hand && Math.sign(r.cy - hand.cy) === dir)
      .sort((a, b) => Math.abs(a.cy - hand.cy) - Math.abs(b.cy - hand.cy));
  /** 含纯副露组、且离上一个这样的行（或手牌行）不超过一跳的行：副露多时是一层层摞上去的 */
  const meldRows = (closedGroup: Item[], hand: Row, h: number): Set<Row> => {
    const near = new Set<Row>([hand]);
    for (const dir of [-1, 1] as const) {
      let from = hand.cy;
      for (const row of outward(hand, dir)) {
        if (Math.abs(row.cy - from) > HAND_WINDOW.hop * h) break;
        if (!row.groups.some((g) => g !== closedGroup && isPureMelds(g))) continue;
        near.add(row);
        from = row.cy;
      }
    }
    return near;
  };
  /** 窗口内的纯副露组，由近及远（先按行距，同一行按横向距离） */
  const nearbyMeldGroups = (closedGroup: Item[], hand: Row, h: number) => {
    const cx = (g: Item[]) => g.reduce((n, i) => n + i.cx, 0) / Math.max(1, g.length);
    const at = cx(closedGroup);
    return [...meldRows(closedGroup, hand, h)]
      .flatMap((row) =>
        row.groups
          .filter((g) => g !== closedGroup && isPureMelds(g))
          .map((g) => ({ g, dy: Math.abs(row.cy - hand.cy), dx: Math.abs(cx(g) - at) })),
      )
      .sort((a, b) => a.dy - b.dy || a.dx - b.dx)
      .map(({ g }) => g);
  };
  /** 一手牌恰 14 张：暗牌段定下来以后，还容得下几组副露 */
  const meldRoom = (seg: Item[]) => (seg.length % 3 === 2 ? (14 - seg.length) / 3 : MAX_MELDS);

  // 暗牌组第一优先：暗牌段 + 3 × 窗口内副露组数 凑得成 14 的那组——牌河里 5 张带立直宣言牌的一行
  // 也是「3n+2 含横置」，但它凑不成 14；和张没横放的真手牌（线上 4/50）照样胜出。同级取含横置和张的、再取最下面的
  const complete = (): [Item[], Row, Item[]] | null => {
    let best: [Item[], Row, Item[]] | null = null;
    for (const row of rows) {
      for (const g of row.groups) {
        const p = parts.get(g);
        if (!p?.closed) continue;
        const seg = p.closed;
        // 同组拆出来的副露必须全算；别处的由近及远补，够数即可（多出来的是牌山、牌河里凑巧成形的）
        const need = meldRoom(seg) - p.melds.length;
        const near = nearbyMeldGroups(g, row, scaleOf(seg).h);
        const available = near.reduce((n, m) => n + parts.get(m)!.melds.length, 0);
        if (need < 0 || available < need) continue;
        const better =
          !best ||
          (hasSide(seg) && !hasSide(best[2])) ||
          (hasSide(seg) === hasSide(best[2]) && row.cy > best[1].cy);
        if (better) best = [g, row, seg];
      }
    }
    return best;
  };
  // 凑不成 14（漏检、多认）时的兜底：优先「暗牌段含一张横置的和张」（两张暗牌配四杠时，5 张的指示牌行也是 3n+2，靠横置区分），
  // 其次「暗牌段无横置」，最后任一非副露组（漏检把暗牌切碎时，不让两张的指示牌行冒充暗牌）；
  // 同级取暗牌段最长、再取最下面的行
  const pick = (ok: (g: Item[], seg: Item[]) => boolean): [Item[], Row, Item[]] | null => {
    let best: [Item[], Row, Item[]] | null = null;
    for (const row of rows) {
      for (const g of row.groups) {
        if (isPureMelds(g)) continue;
        const seg = parts.get(g)?.closed ?? g;
        if (!ok(g, seg)) continue;
        if (
          !best ||
          seg.length > best[2].length ||
          (seg.length === best[2].length && row.cy > best[1].cy)
        )
          best = [g, row, seg];
      }
    }
    return best;
  };
  const closedPick =
    complete() ??
    pick((g, seg) => !!parts.get(g)?.closed && hasSide(seg)) ??
    // 拆不开的组（副露里一张认错）按整组长度参与：比两张的指示牌行长，用户改一张就行
    pick((g) => !!parts.get(g)?.closed || !parts.has(g)) ??
    pick(() => true);
  let closedGroup: Item[];
  let handRow: Row;
  let closedSeg: Item[];
  if (closedPick) [closedGroup, handRow, closedSeg] = closedPick;
  else {
    // 所有组都是纯副露（照片里没有暗牌）：不占用任何组，副露照常收集，张数由 count 提示
    handRow = rows[rows.length - 1]!;
    closedGroup = [];
    closedSeg = [];
  }
  const scale = scaleOf(closedSeg);
  if (closedSeg.length % 3 !== 2)
    warn("bad_group", "blocking", `暗牌组应为 3n+2 张，实际 ${closedSeg.length} 张`);
  let droppedBacks = parts.get(closedGroup)?.dropped ?? 0;
  // 采信的框：暗牌组整组（含被忽略的牌背，它们也是照片里的实物）
  const used = new Set<number>(closedSeg.map((i) => i.detIndex));

  const closedTiles = closedSeg.filter((i) => i.tile !== null);
  if (closedTiles.length < closedSeg.length) warn("back_in_hand", "info", "暗牌里有牌背，已忽略");
  const sideTiles = closedTiles.filter((i) => i.side);
  let winItem: Item | undefined;
  let winGuessed = false;
  if (sideTiles.length === 1) winItem = sideTiles[0];
  else if (sideTiles.length > 1) {
    winItem = sideTiles[sideTiles.length - 1];
    winGuessed = true;
    warn("multi_win", "info", "暗牌里有多张横放的牌，已取最后一张为和张");
  } else if (closedTiles.length > 0) {
    winItem = closedTiles[closedTiles.length - 1];
    winGuessed = true;
    warn("no_win_tile", "info", "没有横放的和张，已取暗牌最后一张");
  }
  const restTiles = closedTiles.filter((i) => i !== winItem);
  const closed = restTiles.map((i) => i.tile!);
  const closedOrigins = restTiles.map((i) => originOf(i));
  const winTile = winItem?.tile ?? 0;
  if (winItem) {
    closed.push(winTile);
    closedOrigins.push(originOf(winItem, winGuessed));
  }

  // 副露：暗牌所在组拆出来的副露段 + 窗口内能拆成纯副露的组（窗口外含横置的牌多半是牌河里的立直宣言牌）
  const melds: Meld[] = [];
  const meldOrigins: TileOrigin[][] = [];
  const consumed = new Set<Item[]>([closedGroup]);
  const addMeld = (seg: Item[]) => {
    if (isAnkan(seg)) {
      const [a, b] = [seg[1]!, seg[2]!];
      if (a.tile === null || b.tile === null) {
        // 这一组被整体忽略，框也就没有被采信：不能记进 used，否则回流会以为照片全标注了
        warn("bad_group", "blocking", "暗杠中间不是牌面，已忽略该组");
        return;
      }
      seg.forEach((i) => used.add(i.detIndex));
      let t = baseTile(a.tile);
      let mismatch = false;
      if (baseTile(a.tile) !== baseTile(b.tile)) {
        t = baseTile(a.det.conf >= b.det.conf ? a.tile : b.tile);
        mismatch = true;
        warn("kan_mismatch", "info", "暗杠中间两张不一致，已取置信度高的");
      }
      // 暗杠只露中间两张，赤五照实落在它露出来的那一侧：seg[1]/seg[2] 就是牌面下标 1/2，
      // 首尾两张渲染成牌背，赤放那儿看不见也点不着，还白占掉赤五名额。
      // 布局层只管照片里是什么、不看规则：两张都是赤就记两张（赤 4 的五筒真有两张），
      // 超出房间上限的交给 applyRecognized 按规则裁。
      const tiles = [t, t, t, t];
      [a.tile, b.tile].forEach((x, k) => {
        if (isAka(x)) tiles[k + 1] = akaOf(t);
      });
      melds.push({ open: false, tiles });
      // 下标 1/2 与 seg[1]/seg[2] 严格对应，但首尾两张是猜的，mismatch / 双赤时中间两张也被改写过
      // —— 整组记为补出来的，回流据此从不去改暗杠的框
      meldOrigins.push([0, 1, 2, 3].map(() => synthetic(mismatch)));
      return;
    }
    seg.forEach((i) => used.add(i.detIndex));
    const faceItems = seg.filter((i) => i.tile !== null);
    const faces = faceItems.map((i) => i.tile!);
    const origins = faceItems.map((i) => originOf(i));
    if (faces.length < seg.length) {
      warn("back_in_hand", "info", "杠里有一张认成了牌背，按同一张牌补齐");
      faces.push(baseTile(faces[0]!));
      origins.push(synthetic(true));
    }
    melds.push({ open: true, tiles: faces });
    meldOrigins.push(origins);
  };
  for (const seg of parts.get(closedGroup)?.melds ?? []) addMeld(seg);
  // 没有暗牌组时无从谈窗口：照片里只有副露，全收
  const meldGroups = closedPick
    ? nearbyMeldGroups(closedGroup, handRow, scale.h)
    : rows.flatMap((row) => row.groups.filter(isPureMelds));
  // 凑满 14 张就不再收：牌山里的牌背时有时无地拼成「暗杠」，照单全收会让逐帧结果来回跳。
  // 由近及远选，选定后仍按画面顺序（自上而下、从左到右）输出——回流靠组序与用户确认的手牌逐位对齐
  const room = closedPick ? meldRoom(closedSeg) - melds.length : MAX_MELDS;
  const chosen = new Map<Item[], number>();
  let left = room;
  for (const g of meldGroups) {
    if (left <= 0) break;
    const take = Math.min(left, parts.get(g)!.melds.length);
    chosen.set(g, take);
    left -= take;
  }
  for (const row of rows) {
    for (const g of row.groups) {
      const take = chosen.get(g);
      if (take === undefined) continue;
      consumed.add(g);
      droppedBacks += parts.get(g)!.dropped;
      for (const seg of parts.get(g)!.melds.slice(0, take)) addMeld(seg);
    }
  }
  if (droppedBacks > 0)
    warn("back_in_hand", "info", `手牌与副露之间有 ${droppedBacks} 张牌背，已忽略`);

  // 指示牌行：从手牌行往外逐行走，干净（不含横置/牌背、≤5 张）且一跳之内才收，遇到别的就停——
  // 指示牌与手牌之间不会隔着牌河。横拍只看上方；竖拍分不清哪边是「上」，两侧都走、取行数多的那一侧。
  // 离手牌近的是里宝，远的是表宝牌。
  const leftover = rows
    .map((row) => ({ row, tiles: row.groups.filter((g) => !consumed.has(g)).flat() }))
    .filter(({ tiles }) => tiles.length > 0);
  const gapToHand = 0.5 * medH;
  const sideOf = (r: Row) =>
    r.cy < handRow.cy - gapToHand ? -1 : r.cy > handRow.cy + gapToHand ? 1 : 0;
  const hops = [HAND_WINDOW.hop * scale.h, HAND_WINDOW.secondHop * scale.h];
  const leftoverOf = new Map(leftover.map(({ row, tiles }) => [row, tiles]));
  const walk = (dir: -1 | 1): Item[][] => {
    const taken: Item[][] = [];
    let from = handRow.cy;
    for (const row of outward(handRow, dir)) {
      if (taken.length === hops.length) break;
      // 已采信的副露行：指示牌可以摆在它外侧，跳距从它起算
      if (row.groups.some((g) => consumed.has(g))) from = row.cy;
      const tiles = leftoverOf.get(row);
      // 只有牌背的行是零星误检（白板偶尔认成牌背），不算数也不挡路
      if (!tiles || tiles.every((t) => t.tile === null)) continue;
      if (sideOf(row) !== dir) continue;
      if (!isCleanRow(tiles) || Math.abs(row.cy - from) > hops[taken.length]!) break;
      taken.push([...tiles].sort((a, b) => a.cx - b.cx));
      from = row.cy;
    }
    return taken;
  };
  const up = walk(-1);
  const down = swap ? walk(1) : [];
  let indicatorRows = down.length > up.length ? down : up;
  if (indicatorRows.length === 2) {
    const [near, far] = [indicatorRows[0]!, indicatorRows[1]!];
    // 有里宝时表里张数必然相等。远的那行更长：它是牌河的末行，近的那行才是表宝牌
    if (far.length > near.length) indicatorRows = [near];
    else if (far.length < near.length)
      warn(
        "indicator_mismatch",
        "blocking",
        `表宝牌指示牌 ${far.length} 张、里宝 ${near.length} 张，张数应当相等`,
      );
  }
  const usedIndicators = indicatorRows.flat();
  usedIndicators.forEach((i) => used.add(i.detIndex));
  const takenRows = new Set(usedIndicators);
  const extra = leftover.reduce(
    (n, { tiles }) => n + tiles.filter((t) => !takenRows.has(t)).length,
    0,
  );
  if (extra > 0) warn("extra_rows", "info", `有 ${extra} 张牌不在手牌、副露或指示牌的位置，已忽略`);
  let doraIndicators: Tile[] = [];
  let uraIndicators: Tile[] = [];
  let doraOrigins: TileOrigin[] = [];
  let uraOrigins: TileOrigin[] = [];
  const tilesOf = (row: Item[]) => row.map((i) => i.tile!);
  const originsOf = (row: Item[]) => row.map((i) => originOf(i));
  if (indicatorRows.length === 1) {
    doraIndicators = tilesOf(indicatorRows[0]!);
    doraOrigins = originsOf(indicatorRows[0]!);
  } else if (indicatorRows.length === 2) {
    uraIndicators = tilesOf(indicatorRows[0]!);
    uraOrigins = originsOf(indicatorRows[0]!);
    doraIndicators = tilesOf(indicatorRows[1]!);
    doraOrigins = originsOf(indicatorRows[1]!);
  }

  const total = closed.length + melds.length * 3;
  // 窗口：横向是已认出的牌（暗牌 + 副露，副露可以摆在别的行）两侧各留 side，纵向是指示牌与副露可能出现的范围。
  // **没凑满 14 张时放开**：整帧缩小后的那一遍常把手牌行漏检成几段、或漏掉一两组副露，窗口若只围着认出来的
  // 那一段，下一遍就再也看不见其余的牌，会在「认不全 → 回整帧 → 还是这一段」里打转。横向放到整帧宽，
  // 纵向按还缺的副露组数每组多留一跳。
  const windowOf = (): Box => {
    const missing = Math.min(MAX_MELDS, Math.max(0, Math.ceil((14 - total) / 3)));
    const seen = [closedGroup, ...meldGroups].flat();
    const x1 = missing
      ? -FAR
      : Math.min(...seen.map((i) => i.cx - i.w / 2)) - HAND_WINDOW.side * scale.w;
    const x2 = missing
      ? FAR
      : Math.max(...seen.map((i) => i.cx + i.w / 2)) + HAND_WINDOW.side * scale.w;
    const cys = [handRow.cy, ...meldGroups.map((g) => rowOf.get(g)!.cy)];
    const slack = missing * HAND_WINDOW.hop * scale.h;
    const reach = (HAND_WINDOW.hop + HAND_WINDOW.secondHop + 0.5) * scale.h + slack;
    const y1 = Math.min(...cys) - reach;
    // 下方没有指示牌，只留一跳给还没认出来的副露；竖拍分不清上下，两侧对称
    const y2 = Math.max(...cys) + (swap ? reach : (HAND_WINDOW.hop + 0.5) * scale.h + slack);
    return swap ? [y1, x1, y2, x2] : [x1, y1, x2, y2];
  };

  if (total !== 14) warn("count", "blocking", `暗牌与副露合计应为 14 张，实际 ${total} 张`);

  return {
    hand: { closed, melds, winTile, doraIndicators, uraIndicators },
    warnings,
    provenance: {
      closed: closedOrigins,
      melds: meldOrigins,
      doraIndicators: doraOrigins,
      uraIndicators: uraOrigins,
      usedDetections: sorted(used),
      rejectedDetections: sorted(rejected),
    },
    window: closedPick ? windowOf() : null,
  };
}
