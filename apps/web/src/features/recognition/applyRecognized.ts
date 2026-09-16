import {
  baseTile,
  DEFAULT_LAYOUT,
  isAka,
  type Detection,
  type HandProvenance,
  type RecognitionResult,
  type RecognitionWarning,
  type RoomRules,
  type TileOrigin,
} from "@riichi/core";
import type { TileLoc } from "@/features/hand/tileLoc";
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
 * 把识别结果灌进草稿：切到牌面模式、替换牌与指示牌、清掉旧的评估结果；旗标（立直/一发/自摸…）不动。
 * 规则收口：不用赤五的房间把赤五折回普通五；宝牌指示牌按是否开杠宝截断；里宝只在立直时保留。
 */
export function applyRecognized(
  draft: ValueDraft,
  result: RecognitionResult,
  rules: RoomRules,
  key: string,
): ValueDraft {
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
  return {
    ...draft,
    mode: "hand",
    hand: {
      ...draft.hand,
      closed: result.hand.closed.map(fold),
      melds: result.hand.melds.map((m) => ({ ...m, tiles: m.tiles.map(fold) })),
      winTile: fold(result.hand.winTile),
      doraIndicators,
      uraIndicators,
      riichi,
    },
    evaluated: null,
    riichiAuto,
    // 新的一次识别：回到确认态，之前点过的「改牌」不再生效
    editing: false,
    recognition: {
      key,
      id: null,
      ms: result.ms,
      warnings,
      uncertain: uncertainLocs(
        result.provenance,
        result.detections,
        doraIndicators.length,
        uraIndicators.length,
      ),
    },
  };
}
