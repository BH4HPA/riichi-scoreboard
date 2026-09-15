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

/** 主轴：分别按 y 与按 x 聚类，哪个方向的最大簇更大就用哪个；竖拍时交换坐标。 */
function pickSwap(dets: readonly Detection[], opts: LayoutOptions): boolean {
  const byRow = toItems(dets, false, opts.sideAspect);
  const byCol = toItems(dets, true, opts.sideAspect);
  const largest = (items: Item[]) =>
    Math.max(
      ...clusterRows(items, opts.rowGap * median(items.map((i) => i.h))).map((r) => r.length),
    );
  return largest(byCol) > largest(byRow);
}

function isAnkan(g: Item[]): boolean {
  return g.length === 4 && g[0]!.tile === null && g[3]!.tile === null;
}

function isMeldCandidate(g: Item[]): boolean {
  return (g.length === 3 || g.length === 4) && (g.some((i) => i.side) || isAnkan(g));
}

function isClosedCandidate(g: Item[]): boolean {
  return g.length % 3 === 2;
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

  const items = toItems(detections, pickSwap(detections, opts), opts.sideAspect);
  const upright = items.filter((i) => !i.side);
  const medH = median((upright.length ? upright : items).map((i) => i.h));
  const medW = median((upright.length ? upright : items).map((i) => i.w));
  const rows: Row[] = clusterRows(items, opts.rowGap * medH).map((r) => ({
    cy: r.reduce((s, i) => s + i.cy, 0) / r.length,
    groups: splitGroups(r, opts.groupGap * medW),
  }));

  // 暗牌组：最大的 3n+2 组，平手取最下面的行；没有就退而取最大的组
  let closedGroup: Item[] | null = null;
  let handRow: Row | null = null;
  for (const row of rows) {
    for (const g of row.groups) {
      if (!isClosedCandidate(g)) continue;
      if (
        !closedGroup ||
        g.length > closedGroup.length ||
        (g.length === closedGroup.length && row.cy > handRow!.cy)
      ) {
        closedGroup = g;
        handRow = row;
      }
    }
  }
  if (!closedGroup || !handRow) {
    for (const row of rows) {
      for (const g of row.groups) {
        if (isMeldCandidate(g)) continue;
        if (!closedGroup || g.length > closedGroup.length) {
          closedGroup = g;
          handRow = row;
        }
      }
    }
    if (!closedGroup || !handRow) {
      closedGroup = rows[rows.length - 1]!.groups[0]!;
      handRow = rows[rows.length - 1]!;
    }
    warn("bad_group", `暗牌组应为 3n+2 张，实际 ${closedGroup.length} 张`);
  }

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

  // 指示牌行：手牌行上方、剩余的组不含横置/牌背且 ≤5 张的行；最近两行上表下里
  const indicatorRows: Item[][] = [];
  let extra = 0;
  for (const row of rows) {
    const rest = row.groups.filter((g) => !consumed.has(g));
    if (rest.length === 0) continue;
    const tiles = rest.flat().sort((a, b) => a.cx - b.cx);
    const above = row.cy < handRow.cy - 0.5 * medH;
    const clean = tiles.every((i) => !i.side && i.tile !== null);
    if (above && clean && tiles.length <= 5) indicatorRows.push(tiles);
    else extra += tiles.length;
  }
  if (extra > 0) warn("extra_rows", `有 ${extra} 张牌不在手牌、副露或指示牌的位置，已忽略`);
  indicatorRows.sort((a, b) => b[0]!.cy - a[0]!.cy); // 离手牌近的在前
  let doraIndicators: Tile[] = [];
  let uraIndicators: Tile[] = [];
  if (indicatorRows.length === 1) doraIndicators = indicatorRows[0]!.map((i) => i.tile!);
  else if (indicatorRows.length >= 2) {
    uraIndicators = indicatorRows[0]!.map((i) => i.tile!);
    doraIndicators = indicatorRows[1]!.map((i) => i.tile!);
    if (indicatorRows.length > 2) warn("extra_rows", "指示牌超过两行，只取最近的两行");
  }
  if (uraIndicators.length > doraIndicators.length) {
    warn("too_many_dora", "里宝指示牌多于表宝牌，已截断");
    uraIndicators = uraIndicators.slice(0, doraIndicators.length);
  }

  const total = closed.length + melds.length * 3;
  if (total !== 14) warn("count", `暗牌与副露合计应为 14 张，实际 ${total} 张`);

  return { hand: { closed, melds, winTile, doraIndicators, uraIndicators }, warnings };
}
