import type { Meld, RecognitionWarning, RecognizedHand } from "@riichi/core";

/** 最近 WINDOW_FRAMES 帧里有 STABLE_FRAMES 帧认出同一副牌就定格（<300 ms/帧下约 1–1.5 秒） */
export const STABLE_FRAMES = 3;
export const WINDOW_FRAMES = 5;
/** 同一条 blocking 连着出现这么多帧才告诉用户：闪一下就消失的不值得打扰 */
export const REASON_FRAMES = 3;

export interface CaptureState {
  /** 最近几帧的牌面指纹，新的在后；null = 这一帧不算数（有 blocking，或还没收紧到手牌周围） */
  keys: readonly (string | null)[];
  /** 正在挡着定格的那条 blocking，及它已经连续出现了几帧 */
  blocked: { message: string; frames: number } | null;
}

export const EMPTY_CAPTURE: CaptureState = { keys: [], blocked: null };

/**
 * 牌面指纹：**只比暗牌 + 和张 + 副露，不比指示牌**。
 * 指示牌离手牌最远、最容易闪，而它对「这手牌认全了没有」这个判断最不重要；
 * 定格时取触发帧的指示牌即可。
 */
export function handKey(hand: RecognizedHand): string {
  const meld = (m: Meld) => `${m.open ? "o" : "c"}${m.tiles.join(",")}`;
  // 副露组之间的先后由摆放位置决定，排序后比较，免得镜头一晃组序变了就重新计数
  return `${hand.closed.join(",")}|${hand.winTile}|${hand.melds.map(meld).sort().join("/")}`;
}

/** 最新一帧的指纹在窗口里出现了几次；最新一帧不算数时为 0 */
export function votesOf(state: CaptureState): number {
  const last = state.keys[state.keys.length - 1];
  return last == null ? 0 : state.keys.filter((k) => k === last).length;
}

/** 该告诉用户的原因：同一条 blocking 已经连续挡了 REASON_FRAMES 帧 */
export function reasonOf(state: CaptureState): string | null {
  return state.blocked && state.blocked.frames >= REASON_FRAMES ? state.blocked.message : null;
}

/**
 * 自动定格的闸门用**语义**而不是几何稳定性：文档扫描只能比框的 IoU，因为它不知道纸上是什么；
 * 我们知道这手牌合不合法。「合计 14 张」不用单独判——`count` 正是在合计不等于 14 时触发，而它是 blocking。
 *
 * 滑窗投票而不是「连续 N 帧」：画面里带着牌河时，单帧漏检 / 多认很常见，一帧不算数就清零的话永远凑不齐；
 * 但最新两帧必须一致——A B A B A 这种一半时间在跳的牌面，A 也能攒够 3 票，不该定格。
 */
export function feedFrame(
  state: CaptureState,
  frame: { hand: RecognizedHand; warnings: readonly RecognitionWarning[]; settled: boolean },
): { state: CaptureState; fire: boolean } {
  // 还没收紧到手牌周围的那一遍只认得准位置：不计票，它的提示也不作数
  const block = frame.settled ? frame.warnings.find((w) => w.severity === "blocking") : undefined;
  const key = frame.settled && !block ? handKey(frame.hand) : null;
  const keys = [...state.keys, key].slice(-WINDOW_FRAMES);
  const blocked = !frame.settled
    ? state.blocked
    : block
      ? {
          message: block.message,
          frames: state.blocked?.message === block.message ? state.blocked.frames + 1 : 1,
        }
      : null;
  const next: CaptureState = { keys, blocked };
  const agreed = key !== null && keys[keys.length - 2] === key;
  return { state: next, fire: agreed && votesOf(next) >= STABLE_FRAMES };
}
