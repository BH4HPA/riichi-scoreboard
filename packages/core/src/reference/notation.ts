import { AKA, TILE, type Meld, type Tile } from "../types/tiles";

/**
 * MPSZ 记法 → 牌列表："123m406p7z" = 1万 2万 3万 4筒 赤5筒 6筒 中。
 * m/p/s 里的 0 表示赤五；z 的 1..7 = 东南西北白发中。
 */
export function parseTiles(notation: string): Tile[] {
  const out: Tile[] = [];
  let digits: number[] = [];
  for (const ch of notation.replace(/\s+/g, "")) {
    if (ch >= "0" && ch <= "9") {
      digits.push(Number(ch));
      continue;
    }
    const suit = ch as "m" | "p" | "s" | "z";
    for (const d of digits) out.push(tileOf(suit, d));
    digits = [];
  }
  if (digits.length) throw new Error(`记法缺少花色：${notation}`);
  return out;
}

function tileOf(suit: "m" | "p" | "s" | "z", d: number): Tile {
  switch (suit) {
    case "m":
      return d === 0 ? AKA.M5 : d;
    case "p":
      return d === 0 ? AKA.P5 : 9 + d;
    case "s":
      return d === 0 ? AKA.S5 : 18 + d;
    case "z":
      if (d < 1 || d > 7) throw new Error(`字牌只能是 1..7：${d}z`);
      return TILE.East + d - 1;
    default:
      throw new Error(`未知花色：${suit}`);
  }
}

export interface HandExample {
  closed: Tile[];
  melds: Meld[];
  /** 和张（精确码），null 表示不单独标出 */
  winTile: Tile | null;
  doraIndicators: Tile[];
  uraIndicators: Tile[];
}

/** 组装示例手牌；win 未给时取 closed 最后一张。 */
export function example(
  closed: string,
  opts: {
    melds?: Array<{ open: boolean; tiles: string }>;
    win?: string | null;
    dora?: string;
    ura?: string;
  } = {},
): HandExample {
  const tiles = parseTiles(closed);
  const win =
    opts.win === null
      ? null
      : opts.win
        ? parseTiles(opts.win)[0]!
        : (tiles[tiles.length - 1] ?? null);
  return {
    closed: tiles,
    melds: (opts.melds ?? []).map((m) => ({ open: m.open, tiles: parseTiles(m.tiles) })),
    winTile: win,
    doraIndicators: opts.dora ? parseTiles(opts.dora) : [],
    uraIndicators: opts.ura ? parseTiles(opts.ura) : [],
  };
}
