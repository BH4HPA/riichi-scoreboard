import { baseTile, isAka, isHonor, tileSuit, type Meld, type Tile } from "../types/tiles";
import { tileOfClassId } from "./classes";
import type {
  Detection,
  RecognizedHand,
  RecognitionWarning,
  RecognitionWarningCode,
} from "./types";

/**
 * 检测框 → 手牌。摆牌约定（与用户定稿）：
 * - 暗牌连排，和张横放接在任一端（同一组，不留空）；暗牌组含和张恒为 3n+2 张。
 * - 副露 3/4 张且含一张横置，或 牌背-X-X-牌背 的暗杠；放在手牌行右侧、下方或上方都行。
 * - 指示牌在手牌行上方，不含横置与牌背，每行 ≤5 张；两行时上表下里，一行全表。
 * - 照片已由用户裁剪，只含手牌 / 副露 / 指示牌；多出来的行只报警告。
 * 前提：detections 的 cls 已在类目录范围内（decodeNmsOutput / validate 都保证）。
 * 不抛错：能拼多少拼多少，问题写进 warnings，交编辑器让用户改。
 */
export interface LayoutOptions {
  /** 行聚类阈值：相邻框中心的纵向差超过 rowGap × 中位牌高 视为新行 */
  rowGap: number;
  /** 分组阈值：行内相邻框的横向间隙超过 groupGap × 中位牌宽 视为新组 */
  groupGap: number;
  /** 横置判定：框宽 > 框高 × sideAspect */
  sideAspect: number;
  /** 低于此置信度的框记 low_conf 警告 */
  lowConf: number;
  /** 低于此置信度的框不参与布局（评估集里误检在 0.32–0.34，真牌最低 0.60） */
  minConf: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  rowGap: 0.6,
  groupGap: 0.5,
  // 正放的牌框比约 0.7–0.85，横置约 1.1–1.4（斜拍会压扁），取 1.0 分界
  sideAspect: 1.0,
  lowConf: 0.5,
  minConf: 0.4,
};

export interface LayoutResult {
  hand: RecognizedHand;
  warnings: RecognitionWarning[];
}

const MAX_MELDS = 4;
const MAX_INDICATORS = 5;

interface Item {
  det: Detection;
  /** null = 牌背 */
  tile: Tile | null;
  cx: number;
  cy: number;
  w: number;
  h: number;
  side: boolean;
}

interface Row {
  cy: number;
  groups: Item[][];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** 主轴：正放的牌是竖长的；照片里多数框「宽 > 高」说明手机竖拍没转，交换坐标按列读。 */
function isPortrait(dets: readonly Detection[]): boolean {
  const wide = dets.filter((d) => d.box[2] - d.box[0] > d.box[3] - d.box[1]).length;
  return wide > dets.length - wide;
}

function toItems(dets: readonly Detection[], swap: boolean, sideAspect: number): Item[] {
  return dets.map((det) => {
    const [x1, y1, x2, y2] = det.box;
    const w0 = x2 - x1;
    const h0 = y2 - y1;
    const [cx, cy, w, h] = swap
      ? [(y1 + y2) / 2, (x1 + x2) / 2, h0, w0]
      : [(x1 + x2) / 2, (y1 + y2) / 2, w0, h0];
    return { det, tile: tileOfClassId(det.cls), cx, cy, w, h, side: w > h * sideAspect };
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

function isAnkan(g: Item[]): boolean {
  return g.length === 4 && g[0]!.tile === null && g[3]!.tile === null;
}

/**
 * 副露段：暗杠（牌背-X-X-牌背），或 3/4 张牌面含横置且牌型合法（碰三同、杠四同、吃同色顺子）。
 * 吃/碰恰一张横置；杠允许两张（加杠的实际摆法是加的那张横着叠在横置牌上）。
 */
function isMeldSegment(g: Item[]): boolean {
  if (isAnkan(g)) return true;
  if (g.length !== 3 && g.length !== 4) return false;
  const faces = g.filter((i) => i.tile !== null);
  // 明杠允许一张牌背：白板是空白面，模型偶尔把它认成牌背
  if (faces.length < g.length && !(g.length === 4 && faces.length === 3)) return false;
  const sides = g.filter((i) => i.side).length;
  const bases = faces.map((i) => baseTile(i.tile!)).sort((a, b) => a - b);
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
 * 明杠/加杠的第四张是横着叠在横置牌上面的，框中心比同组其他牌高出约一张牌宽，会被聚成单独一行。
 * 同一种牌的两张横置框横向重叠、纵向相距不超过 1.2 倍框高时视为叠放，把两张的 cy 归到中点。
 */
function mergeStacked(items: Item[]): void {
  const sides = items.filter((i) => i.side && i.tile !== null);
  for (const a of sides) {
    for (const b of sides) {
      if (a === b || baseTile(a.tile!) !== baseTile(b.tile!)) continue;
      const dy = Math.abs(a.cy - b.cy);
      if (dy === 0 || dy > 1.2 * Math.max(a.h, b.h)) continue;
      if (Math.abs(a.cx - b.cx) > 0.5 * Math.max(a.w, b.w)) continue;
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
  let best: Partition | null = null;
  const score = (p: Partition) => (p.closed?.length ?? 0) * 100 - p.melds.length;
  const walk = (from: number, closed: Item[] | null, melds: Item[][]) => {
    if (from === g.length) {
      if (closed === null && melds.length === 0) return;
      const p = { closed, melds, dropped };
      if (!best || score(p) > score(best)) best = p;
      return;
    }
    for (const size of [3, 4]) {
      const seg = g.slice(from, from + size);
      if (seg.length === size && isMeldSegment(seg)) walk(from + size, closed, [...melds, seg]);
    }
    if (!closed) {
      for (let size = 2; from + size <= g.length; size += 3) {
        const seg = g.slice(from, from + size);
        if (isClosedSegment(seg)) walk(from + size, seg, melds);
      }
    }
  };
  walk(0, null, []);
  return best;
}

function isCleanRow(items: Item[]): boolean {
  return items.length <= MAX_INDICATORS && items.every((i) => !i.side && i.tile !== null);
}

export function layoutHand(
  allDetections: readonly Detection[],
  options: Partial<LayoutOptions> = {},
): LayoutResult {
  const opts = { ...DEFAULT_LAYOUT, ...options };
  const detections = allDetections.filter((d) => d.conf >= opts.minConf);
  const warnings: RecognitionWarning[] = [];
  const warn = (code: RecognitionWarningCode, message: string) => warnings.push({ code, message });
  const empty: RecognizedHand = {
    closed: [],
    melds: [],
    winTile: 0,
    doraIndicators: [],
    uraIndicators: [],
  };
  if (detections.length === 0) {
    warn("no_tiles", "照片里没有认出任何牌");
    return { hand: empty, warnings };
  }

  const low = detections.filter((d) => d.conf < opts.lowConf).length;
  if (low > 0) warn("low_conf", `${low} 张牌置信度较低，请核对`);

  const swap = isPortrait(detections);
  // 牌是刚性的，同一张照片里正放牌的框比例高度一致；明显更窄的框是误检（残缺、杂物），剔除
  const all = toItems(detections, swap, opts.sideAspect);
  const ratioRef = median(all.filter((i) => !i.side).map((i) => i.w / i.h));
  const items = all.filter((i) => i.side || i.w / i.h >= 0.85 * ratioRef);
  if (items.length < all.length)
    warn("odd_box", `${all.length - items.length} 个检测框形状异常，已忽略`);
  mergeStacked(items);
  const upright = items.filter((i) => !i.side);
  const medH = median((upright.length ? upright : items).map((i) => i.h));
  const medW = median((upright.length ? upright : items).map((i) => i.w));
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
  // 暗牌组：优先「暗牌段含一张横置的和张」（两张暗牌配四杠时，5 张的指示牌行也是 3n+2，靠横置区分），
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
  const hasSide = (seg: Item[]) => seg.some((i) => i.side && i.tile !== null);
  const closedPick =
    pick((g, seg) => !!parts.get(g)?.closed && hasSide(seg)) ??
    pick((g) => !!parts.get(g)?.closed) ??
    pick(() => true);
  let closedGroup: Item[];
  let handRow: Row;
  let closedSeg: Item[];
  if (closedPick) [closedGroup, handRow, closedSeg] = closedPick;
  else {
    handRow = rows[rows.length - 1]!;
    closedGroup = handRow.groups[0]!;
    closedSeg = closedGroup;
  }
  if (closedSeg.length % 3 !== 2)
    warn("bad_group", `暗牌组应为 3n+2 张，实际 ${closedSeg.length} 张`);
  const droppedBacks = parts.get(closedGroup)?.dropped ?? 0;
  if (droppedBacks > 0) warn("back_in_hand", `手牌行里有 ${droppedBacks} 张牌背，已忽略`);

  // 暗牌 + 和张
  const closedTiles = closedSeg.filter((i) => i.tile !== null);
  if (closedTiles.length < closedSeg.length) warn("back_in_hand", "暗牌里有牌背，已忽略");
  const sideTiles = closedTiles.filter((i) => i.side);
  let winItem: Item | undefined;
  if (sideTiles.length === 1) winItem = sideTiles[0];
  else if (sideTiles.length > 1) {
    winItem = sideTiles[sideTiles.length - 1];
    warn("multi_win", "暗牌里有多张横放的牌，已取最后一张为和张");
  } else if (closedTiles.length > 0) {
    winItem = closedTiles[closedTiles.length - 1];
    warn("no_win_tile", "没有横放的和张，已取暗牌最后一张");
  }
  const closed = closedTiles.filter((i) => i !== winItem).map((i) => i.tile!);
  const winTile = winItem?.tile ?? 0;
  if (winItem) closed.push(winTile);

  // 副露：暗牌所在组拆出来的副露段 + 其他任何行里能拆成纯副露的组
  const melds: Meld[] = [];
  const consumed = new Set<Item[]>([closedGroup]);
  const addMeld = (seg: Item[]) => {
    if (melds.length >= MAX_MELDS) {
      warn("bad_group", "副露超过 4 组，多出的已忽略");
      return;
    }
    if (isAnkan(seg)) {
      const [a, b] = [seg[1]!, seg[2]!];
      if (a.tile === null || b.tile === null) {
        warn("bad_group", "暗杠中间不是牌面，已忽略该组");
        return;
      }
      let t = baseTile(a.tile);
      if (baseTile(a.tile) !== baseTile(b.tile)) {
        t = baseTile(a.det.conf >= b.det.conf ? a.tile : b.tile);
        warn("kan_mismatch", "暗杠中间两张不一致，已取置信度高的");
      }
      // 暗杠只露中间两张：其中有赤五就记一张赤五（一副牌每色只有一张）
      const aka = [a.tile, b.tile].find((x) => isAka(x) && baseTile(x) === t);
      melds.push({ open: false, tiles: [t, t, t, aka ?? t] });
      return;
    }
    const faces = seg.filter((i) => i.tile !== null).map((i) => i.tile!);
    if (faces.length < seg.length) {
      warn("back_in_hand", "杠里有一张认成了牌背，按同一张牌补齐");
      faces.push(baseTile(faces[0]!));
    }
    melds.push({ open: true, tiles: faces });
  };
  for (const seg of parts.get(closedGroup)?.melds ?? []) addMeld(seg);
  for (const row of rows) {
    for (const g of row.groups) {
      if (g === closedGroup || !isPureMelds(g)) continue;
      consumed.add(g);
      for (const seg of parts.get(g)!.melds) addMeld(seg);
    }
  }

  // 指示牌行：手牌行之外、剩余的组不含横置/牌背且 ≤5 张的行。横拍只看上方；竖拍分不清哪边是「上」，
  // 两侧都收集、取有干净行的那一侧（两侧都有取行数多的）。离手牌近的是里宝，远的是表宝牌。
  const leftover = rows
    .map((row) => ({ row, tiles: row.groups.filter((g) => !consumed.has(g)).flat() }))
    .filter(({ tiles }) => tiles.length > 0);
  const gapToHand = 0.5 * medH;
  const sideOf = (r: Row) =>
    r.cy < handRow.cy - gapToHand ? -1 : r.cy > handRow.cy + gapToHand ? 1 : 0;
  const candidates = (dir: -1 | 1) =>
    leftover
      .filter(({ row, tiles }) => sideOf(row) === dir && isCleanRow(tiles))
      .map(({ row, tiles }) => ({
        dist: Math.abs(row.cy - handRow.cy),
        tiles: [...tiles].sort((a, b) => a.cx - b.cx),
      }))
      .sort((a, b) => a.dist - b.dist);
  const up = candidates(-1);
  const down = swap ? candidates(1) : [];
  const indicatorRows = (down.length > up.length ? down : up).map((c) => c.tiles);
  const used = new Set(indicatorRows.slice(0, 2).flat());
  const extra = leftover.reduce((n, { tiles }) => n + tiles.filter((t) => !used.has(t)).length, 0);
  if (extra > 0) warn("extra_rows", `有 ${extra} 张牌不在手牌、副露或指示牌的位置，已忽略`);
  let doraIndicators: Tile[] = [];
  let uraIndicators: Tile[] = [];
  if (indicatorRows.length === 1) doraIndicators = indicatorRows[0]!.map((i) => i.tile!);
  else if (indicatorRows.length >= 2) {
    uraIndicators = indicatorRows[0]!.map((i) => i.tile!);
    doraIndicators = indicatorRows[1]!.map((i) => i.tile!);
  }
  if (uraIndicators.length > doraIndicators.length) {
    warn("too_many_dora", "里宝指示牌多于表宝牌，已截断");
    uraIndicators = uraIndicators.slice(0, doraIndicators.length);
  }

  const total = closed.length + melds.length * 3;
  if (total !== 14) warn("count", `暗牌与副露合计应为 14 张，实际 ${total} 张`);

  return { hand: { closed, melds, winTile, doraIndicators, uraIndicators }, warnings };
}
