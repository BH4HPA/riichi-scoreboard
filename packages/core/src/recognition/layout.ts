import type { Meld, Tile } from "../types/tiles";
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
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  rowGap: 0.6,
  groupGap: 0.5,
  sideAspect: 1.15,
  lowConf: 0.5,
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

function isMeldCandidate(g: Item[]): boolean {
  return (g.length === 3 || g.length === 4) && (g.some((i) => i.side) || isAnkan(g));
}

function isCleanRow(items: Item[]): boolean {
  return items.length <= MAX_INDICATORS && items.every((i) => !i.side && i.tile !== null);
}

export function layoutHand(
  detections: readonly Detection[],
  options: Partial<LayoutOptions> = {},
): LayoutResult {
  const opts = { ...DEFAULT_LAYOUT, ...options };
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
  const items = toItems(detections, swap, opts.sideAspect);
  const upright = items.filter((i) => !i.side);
  const medH = median((upright.length ? upright : items).map((i) => i.h));
  const medW = median((upright.length ? upright : items).map((i) => i.w));
  const rows: Row[] = clusterRows(items, opts.rowGap * medH).map((r) => ({
    cy: r.reduce((s, i) => s + i.cy, 0) / r.length,
    groups: splitGroups(r, opts.groupGap * medW),
  }));

  // 暗牌组：优先「3n+2 张且含横置的和张」（两张暗牌配四杠时，5 张的指示牌行也是 3n+2，靠横置区分），
  // 其次最大的非副露组（漏检把暗牌切碎时，不让两张的指示牌行冒充暗牌）；同级取最大、再取最下面的行
  const pick = (ok: (g: Item[]) => boolean): [Item[], Row] | null => {
    let best: [Item[], Row] | null = null;
    for (const row of rows) {
      for (const g of row.groups) {
        if (isMeldCandidate(g) || !ok(g)) continue;
        if (
          !best ||
          g.length > best[0].length ||
          (g.length === best[0].length && row.cy > best[1].cy)
        )
          best = [g, row];
      }
    }
    return best;
  };
  const closedPick =
    pick((g) => g.length % 3 === 2 && g.some((i) => i.side && i.tile !== null)) ?? pick(() => true);
  let closedGroup: Item[];
  let handRow: Row;
  if (closedPick) [closedGroup, handRow] = closedPick;
  else {
    handRow = rows[rows.length - 1]!;
    closedGroup = handRow.groups[0]!;
  }
  if (closedGroup.length % 3 !== 2)
    warn("bad_group", `暗牌组应为 3n+2 张，实际 ${closedGroup.length} 张`);

  // 暗牌 + 和张
  const closedTiles = closedGroup.filter((i) => i.tile !== null);
  if (closedTiles.length < closedGroup.length) warn("back_in_hand", "暗牌里有牌背，已忽略");
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

  // 副露：任何行里的副露候选
  const melds: Meld[] = [];
  const consumed = new Set<Item[]>([closedGroup]);
  for (const row of rows) {
    for (const g of row.groups) {
      if (g === closedGroup || !isMeldCandidate(g)) continue;
      consumed.add(g);
      if (melds.length >= MAX_MELDS) {
        warn("bad_group", "副露超过 4 组，多出的已忽略");
        continue;
      }
      if (isAnkan(g)) {
        const [a, b] = [g[1]!, g[2]!];
        if (a.tile === null || b.tile === null) {
          warn("bad_group", "暗杠中间不是牌面，已忽略该组");
          continue;
        }
        let t = a.tile;
        if (a.tile !== b.tile) {
          t = a.det.conf >= b.det.conf ? a.tile : b.tile;
          warn("kan_mismatch", "暗杠中间两张不一致，已取置信度高的");
        }
        melds.push({ open: false, tiles: [t, t, t, t] });
        continue;
      }
      const faces = g.filter((i) => i.tile !== null).map((i) => i.tile!);
      if (faces.length !== g.length) warn("back_in_hand", "副露里有牌背，已忽略");
      if (faces.length !== 3 && faces.length !== 4) {
        warn("bad_group", `副露应为 3 或 4 张，实际 ${faces.length} 张，已忽略`);
        continue;
      }
      melds.push({ open: true, tiles: faces });
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
