import {
  baseTile,
  isAka,
  type RecognitionEngine,
  type RecognitionResult,
  type RecognitionWarning,
  type RoomRules,
} from "@riichi/core";
import type { ValueDraft } from "@/features/settlement/valueDraft";

/** 草稿里挂的识别信息：记录 id（上传完成后才有）、引擎、耗时、提示。 */
export interface DraftRecognition {
  id: string | null;
  engine: RecognitionEngine;
  ms: number;
  warnings: RecognitionWarning[];
}

/**
 * 把识别结果灌进草稿：切到牌面模式、替换牌与指示牌、清掉旧的评估结果；旗标（立直/一发/自摸…）不动。
 * 规则收口：不用赤五的房间把赤五折回普通五；宝牌指示牌按是否开杠宝截断；里宝只在立直时保留。
 */
export function applyRecognized(
  draft: ValueDraft,
  result: RecognitionResult,
  rules: RoomRules,
): ValueDraft {
  const fold = (t: number) => (rules.hand.akaCount === 0 && isAka(t) ? baseTile(t) : t);
  const warnings = [...result.warnings];
  const maxDora = rules.hand.kanDora ? 5 : 1;
  let doraIndicators = result.hand.doraIndicators.map(fold);
  if (doraIndicators.length > maxDora) {
    doraIndicators = doraIndicators.slice(0, maxDora);
    warnings.push({
      code: "too_many_dora",
      message: `当前规则最多 ${maxDora} 张宝牌指示牌，已截断`,
    });
  }
  const riichi = draft.hand.riichi || draft.hand.doubleRiichi;
  let uraIndicators = result.hand.uraIndicators.map(fold).slice(0, doraIndicators.length);
  if (uraIndicators.length > 0 && (!riichi || !rules.hand.uraDora)) {
    uraIndicators = [];
    warnings.push({
      code: "extra_rows",
      message: rules.hand.uraDora
        ? "认出了里宝指示牌，勾选立直后再补"
        : "当前规则无里宝，已忽略里宝指示牌",
    });
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
    },
    evaluated: null,
    recognition: { id: null, engine: result.engine, ms: result.ms, warnings },
  };
}
