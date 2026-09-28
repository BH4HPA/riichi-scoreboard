import {
  SAMPLE_GAP_MS,
  SAMPLE_MAX,
  type RecognizedHand,
  type RecognitionWarning,
} from "@riichi/core";
import { handKey } from "../autoCapture";

/** 采样判断只看这一帧的这几样 */
export type SampleFrame = {
  settled: boolean;
  warnings: RecognitionWarning[];
  hand: RecognizedHand;
};

/**
 * 画面状态：还没收紧到手牌 / 被哪条 blocking 挡住 / 认成了哪副牌。
 * 状态变了才值得多留一帧；没变时留最新的那一帧就够了。
 */
export function signatureOf(f: SampleFrame): string {
  if (!f.settled) return "unsettled";
  const block = f.warnings.find((w) => w.severity === "blocking");
  return block ? `block:${block.code}` : `hand:${handKey(f.hand)}`;
}

export interface SampleSlot<T> {
  sig: string;
  item: T;
}

export interface SamplerState<T> {
  slots: SampleSlot<T>[];
  /** 上一次新开或覆盖的时刻；null = 还没采过 */
  lastAt: number | null;
}

export const EMPTY_SAMPLER: SamplerState<never> = { slots: [], lastAt: null };

export type SampleAction = "new" | "replace";

/**
 * 这一帧要不要采、怎么采（纯函数，调用方据此去 Worker 取照片，再用 recordSample 落位）：
 * - 距上一次新开或覆盖不足 SAMPLE_GAP_MS：不采（编码一张整帧要几十毫秒，不能每帧都来）；
 * - 状态变了：新开一帧；
 * - 状态没变：覆盖最后一帧——但首帧永远不覆盖，只有它一帧时改为新开（留住「开头」与「最新」两头）。
 */
export function nextSample<T>(
  state: SamplerState<T>,
  frame: SampleFrame,
  now: number,
): SampleAction | null {
  if (state.lastAt !== null && now - state.lastAt < SAMPLE_GAP_MS) return null;
  const last = state.slots[state.slots.length - 1];
  if (!last || last.sig !== signatureOf(frame) || state.slots.length === 1) return "new";
  return "replace";
}

/** 把采到的这一帧落位；超出 SAMPLE_MAX 时丢第二帧（首帧是开头的样子，后面几帧是最近的样子） */
export function recordSample<T>(
  state: SamplerState<T>,
  action: SampleAction,
  frame: SampleFrame,
  item: T,
  now: number,
): SamplerState<T> {
  const slot = { sig: signatureOf(frame), item };
  let slots = action === "replace" ? [...state.slots.slice(0, -1), slot] : [...state.slots, slot];
  if (slots.length > SAMPLE_MAX) slots = [slots[0]!, ...slots.slice(2)];
  return { slots, lastAt: now };
}
