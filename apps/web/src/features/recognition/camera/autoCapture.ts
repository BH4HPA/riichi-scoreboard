import type { Meld, RecognitionWarning, RecognizedHand } from "@riichi/core";

/** 连续多少帧认出同一副牌才定格（用户拍板 3；<300 ms/帧下约 1.2 秒） */
export const STABLE_FRAMES = 3;

export interface CaptureState {
  /** 上一帧的牌面指纹；null = 还没有可用的一帧 */
  key: string | null;
  /** 当前指纹已经连续出现几帧 */
  count: number;
}

export const EMPTY_CAPTURE: CaptureState = { key: null, count: 0 };

/**
 * 牌面指纹：**只比暗牌 + 和张 + 副露，不比指示牌**。
 * 指示牌在取景带最远端、最容易闪，而它对「这手牌认全了没有」这个判断最不重要；
 * 定格时取触发帧的指示牌即可。
 */
export function handKey(hand: RecognizedHand): string {
  const meld = (m: Meld) => `${m.open ? "o" : "c"}${m.tiles.join(",")}`;
  // 副露组之间的先后由摆放位置决定，排序后比较，免得镜头一晃组序变了就重新计数
  return `${hand.closed.join(",")}|${hand.winTile}|${hand.melds.map(meld).sort().join("/")}`;
}

/**
 * 自动定格的闸门用**语义**而不是几何稳定性：文档扫描只能比框的 IoU，因为它不知道纸上是什么；
 * 我们知道这手牌合不合法。连续 STABLE_FRAMES 帧认出同一副牌、且没有 blocking 提示就定格。
 * 「合计 14 张」不用单独判——`count` 正是在合计不等于 14 时触发，而它是 blocking。
 *
 * 指纹变了就**重置为 1** 而不是 0：当前这一帧本身算新的第一帧。
 */
export function feedFrame(
  state: CaptureState,
  frame: { hand: RecognizedHand; warnings: readonly RecognitionWarning[] },
): { state: CaptureState; fire: boolean } {
  if (frame.warnings.some((w) => w.severity === "blocking")) {
    return { state: EMPTY_CAPTURE, fire: false };
  }
  const key = handKey(frame.hand);
  const count = state.key === key ? state.count + 1 : 1;
  return { state: { key, count }, fire: count >= STABLE_FRAMES };
}
