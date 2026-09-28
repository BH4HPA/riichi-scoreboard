import type { RecognitionSessionSummary } from "@riichi/core";
import type { FrameResult } from "../../worker/protocol";
import { handKey, votesOf, type CaptureState } from "../autoCapture";

/**
 * 一次取景的逐帧累计。每帧都在变、没有任何界面要读它，所以是个就地累加的对象（放在 ref 里），不走 state。
 */
export interface SessionStats {
  frames: number;
  settledFrames: number;
  secondPasses: number;
  msSum: number;
  blocking: RecognitionSessionSummary["blocking"];
  keyChanges: number;
  lastKey: string | null;
  maxVotes: number;
  video: string;
}

export function createStats(): SessionStats {
  return {
    frames: 0,
    settledFrames: 0,
    secondPasses: 0,
    msSum: 0,
    blocking: {},
    keyChanges: 0,
    lastKey: null,
    maxVotes: 0,
    video: "0x0",
  };
}

/** 记一帧：blocking 与牌面跳变只数可计票（settled）的帧，与定格闸门看的是同一批 */
export function countFrame(s: SessionStats, r: FrameResult, gate: CaptureState): void {
  s.frames += 1;
  s.msSum += r.ms;
  if (r.passes > 1) s.secondPasses += 1;
  s.video = `${r.frame.width}x${r.frame.height}`;
  s.maxVotes = Math.max(s.maxVotes, votesOf(gate));
  if (!r.settled) return;
  s.settledFrames += 1;
  const block = r.warnings.find((w) => w.severity === "blocking");
  if (block) {
    s.blocking[block.code] = (s.blocking[block.code] ?? 0) + 1;
    return;
  }
  const key = handKey(r.hand);
  if (s.lastKey !== null && s.lastKey !== key) s.keyChanges += 1;
  s.lastKey = key;
}

/** 累计值里属于摘要的那几项；其余字段（来源、收场、方向……）由装配处补齐 */
export function statsPart(
  s: SessionStats,
): Pick<
  RecognitionSessionSummary,
  | "frames"
  | "settledFrames"
  | "secondPasses"
  | "msAvg"
  | "blocking"
  | "keyChanges"
  | "maxVotes"
  | "video"
> {
  return {
    frames: s.frames,
    settledFrames: s.settledFrames,
    secondPasses: s.secondPasses,
    msAvg: s.frames > 0 ? Math.round(s.msSum / s.frames) : 0,
    blocking: s.blocking,
    keyChanges: s.keyChanges,
    maxVotes: s.maxVotes,
    video: s.video,
  };
}
