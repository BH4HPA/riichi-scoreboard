import {
  akaLimit,
  baseTile,
  DEFAULT_LAYOUT,
  isAka,
  tileSuit,
  type Detection,
  type HandProvenance,
  type Meld,
  type RecognitionResult,
  type RecognitionWarning,
  type RoomRules,
  type Tile,
  type TileOrigin,
} from "@riichi/core";
import { hasLoc, type TileLoc } from "../hand/tileLoc";
import type { ValueDraft } from "@/features/settlement/valueDraft";

/** 草稿里挂的识别信息：本次运行的 key（等上传用）、记录 id（上传完成后才有）、耗时、提示、没把握的位置。 */
export interface DraftRecognition {
  key: string;
  id: string | null;
  ms: number;
  warnings: RecognitionWarning[];
  /** 建议用户核对的位置：布局靠规则猜出来的，或检测置信度低于 lowConf 的 */
  uncertain: TileLoc[];
}

/** 这张牌值不值得让用户瞄一眼：猜出来的（含补出来的，det = -1），或者置信度低于阈值。 */
function shaky(origin: TileOrigin, detections: readonly Detection[]): boolean {
  if (origin.guessed) return true;
  const det = detections[origin.det];
  return det !== undefined && det.conf < DEFAULT_LAYOUT.lowConf;
}

/**
 * 把来源降解成位置集合。界面只需要「哪几张要核对」，不需要浮点数组在组件之间穿行。
 * `doraKeep` / `uraKeep` 是规则截断后各自剩下的张数，超出的位置直接丢掉，否则记号整体移位。
 */
function uncertainLocs(
  prov: HandProvenance,
  detections: readonly Detection[],
  doraKeep: number,
  uraKeep: number,
): TileLoc[] {
  const locs: TileLoc[] = [];
  const scan = (origins: readonly TileOrigin[], area: TileLoc["area"], limit: number) => {
    origins.slice(0, limit).forEach((o, i) => {
      if (shaky(o, detections)) locs.push({ area, i });
    });
  };
  scan(prov.closed, "closed", prov.closed.length);
  prov.melds.forEach((group, i) =>
    group.forEach((o, j) => {
      if (shaky(o, detections)) locs.push({ area: "meld", i, j });
    }),
  );
  scan(prov.doraIndicators, "dora", doraKeep);
  scan(prov.uraIndicators, "ura", uraKeep);
  return locs;
}

/**
 * 手牌里赤五的规则收口。布局层不看规则、照实记（暗杠两张都认成赤就是两张），裁剪只在这里做一次：
 * - 不用赤五的房间全部折回普通五。照片里确实是赤，只是这桌不算，不打记号。
 * - 用赤五的房间只折超出每色上限的（akaLimit；各色上限之和恰为 akaCount，总数不必另查）。
 *   超额说明模型至少认错了一张，但认错的是哪张不知道：先到先得只是给个合法的默认值，
 *   所以这个花色的赤五**全部**标成要核对，留下的那张也标 —— 否则用户只会去点折掉的那张，
 *   而它因为名额已满改不回赤。
 */
function capAka(
  closed: readonly Tile[],
  melds: readonly Meld[],
  rules: RoomRules,
): { closed: Tile[]; melds: Meld[]; capped: TileLoc[] } {
  const { akaCount } = rules.hand;
  const seen: Record<"m" | "p" | "s", TileLoc[]> = { m: [], p: [], s: [] };
  const cap = (t: Tile, loc: TileLoc): Tile => {
    if (!isAka(t)) return t;
    if (akaCount === 0) return baseTile(t);
    const suit = tileSuit(t) as "m" | "p" | "s";
    seen[suit].push(loc);
    return seen[suit].length <= akaLimit(suit, akaCount) ? t : baseTile(t);
  };
  const nextClosed = closed.map((t, i) => cap(t, { area: "closed", i }));
  const nextMelds = melds.map((m, i) => ({
    ...m,
    tiles: m.tiles.map((t, j) => cap(t, { area: "meld", i, j })),
  }));
  const capped = (["m", "p", "s"] as const).flatMap((suit) =>
    seen[suit].length > akaLimit(suit, akaCount) ? seen[suit] : [],
  );
  return { closed: nextClosed, melds: nextMelds, capped };
}

/**
 * 把识别结果灌进草稿：切到牌面模式、替换牌与指示牌、清掉旧的评估结果；旗标（立直/一发/自摸…）不动。
 * 规则收口：手牌里的赤五按规则裁（见 capAka）；指示牌不占赤五名额，只在不用赤五时折回；
 * 宝牌指示牌按是否开杠宝截断；里宝只在立直时保留。
 */
export function applyRecognized(
  draft: ValueDraft,
  result: RecognitionResult,
  rules: RoomRules,
  key: string,
): ValueDraft {
  const { closed, melds, capped } = capAka(result.hand.closed, result.hand.melds, rules);
  const fold = (t: number) => (rules.hand.akaCount === 0 && isAka(t) ? baseTile(t) : t);
  const warnings = [...result.warnings];
  const maxDora = rules.hand.kanDora ? 5 : 1;
  let doraIndicators = result.hand.doraIndicators.map(fold);
  if (doraIndicators.length > maxDora) {
    doraIndicators = doraIndicators.slice(0, maxDora);
    warnings.push({
      code: "too_many_dora",
      severity: "info",
      message: `当前规则最多 ${maxDora} 张宝牌指示牌，已截断`,
    });
  }
  // 里宝只有立直者才翻：照片里有里宝指示牌就是立直的证据，直接勾上
  let riichi = draft.hand.riichi;
  let riichiAuto = false;
  let uraIndicators = result.hand.uraIndicators.map(fold).slice(0, doraIndicators.length);
  if (uraIndicators.length > 0) {
    if (!rules.hand.uraDora) {
      uraIndicators = [];
      warnings.push({
        code: "extra_rows",
        severity: "info",
        message: "当前规则无里宝，已忽略里宝指示牌",
      });
    } else if (!riichi && !draft.hand.doubleRiichi) {
      riichi = true;
      riichiAuto = true;
      warnings.push({
        code: "extra_rows",
        severity: "info",
        message: "认出了里宝指示牌，已勾选立直",
      });
    }
  }
  const shakyLocs = uncertainLocs(
    result.provenance,
    result.detections,
    doraIndicators.length,
    uraIndicators.length,
  );
  // 和张按位置取：布局把它放在暗牌末尾。按码找会出错 —— 暗牌里两张赤五、末尾那张被折回普通时，
  // 按「同码取最后一张」的约定，和张记号就跳到了前面那张赤五上
  const winIndex = result.hand.closed.lastIndexOf(result.hand.winTile);
  return {
    ...draft,
    mode: "hand",
    hand: {
      ...draft.hand,
      closed,
      melds,
      winTile: closed[winIndex] ?? result.hand.winTile,
      doraIndicators,
      uraIndicators,
      riichi,
    },
    evaluated: null,
    riichiAuto,
    // 新的一次识别：回到确认态，之前点过的「改牌」不再生效
    editing: false,
    uraStash: [],
    recognition: {
      key,
      id: null,
      ms: result.ms,
      warnings,
      uncertain: [...shakyLocs, ...capped.filter((l) => !hasLoc(shakyLocs, l))],
    },
  };
}
