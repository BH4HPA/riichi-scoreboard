import {
  SAMPLE_AFTER_MS,
  type RecognitionSampleMeta,
  type RecognitionSessionOutcome,
  type RecognitionSessionSummary,
} from "@riichi/core";
import { ApiError } from "@/api/client";
import { reportRecognitionSession, uploadRecognitionSample } from "../../api";
import { takeCaptureUpload } from "../../recognize";
import type { Sampled } from "../../worker/protocol";

/** 一帧采样：采的时刻（主线程收到那一帧结果时），以及 Worker 编码中的照片 */
export interface PendingSample {
  at: number;
  sampled: Promise<Sampled | null>;
}

/**
 * 哪些会话留采样帧：放弃的一律留（它们在别处不留任何照片）；定格了的，只有从首帧出结果到定格
 * 超过 SAMPLE_AFTER_MS 的才留——几秒就认稳的会话，定格照已经说明了一切。
 */
export function wantsSamples(
  outcome: RecognitionSessionOutcome,
  firstFrameAt: number | null,
  capturedAt: number | null,
): boolean {
  if (firstFrameAt === null) return false;
  if (outcome === "abandoned") return true;
  return capturedAt !== null && capturedAt - firstFrameAt > SAMPLE_AFTER_MS;
}

export function sampleMeta(
  s: Sampled,
  at: number,
  firstFrameAt: number,
  modelId: string | null,
): RecognitionSampleMeta {
  return {
    modelId,
    t: Math.max(0, Math.round(at - firstFrameAt)),
    ms: s.ms,
    frame: s.frame,
    rotation: s.rotation,
    settled: s.settled,
    passes: s.passes,
    detections: s.detections,
    hand: s.hand,
    warnings: s.warnings,
  };
}

/**
 * 取景页关闭后的上报：先摘要，再（需要时）逐帧上传采样。
 * 采样等定格照传完再发：定格照带着真值，是更要紧的那张，别让几 MB 的采样帧和它抢上行带宽。
 * 逐帧串行、失败不重试：这是锦上添花的数据，被限流了就停，别的错跳过这一帧。
 */
export async function uploadSession(
  {
    summary,
    samples,
    firstFrameAt,
    capturedAt,
  }: {
    summary: RecognitionSessionSummary & { id: string };
    samples: PendingSample[];
    firstFrameAt: number | null;
    capturedAt: number | null;
  },
  token: string,
): Promise<void> {
  await reportRecognitionSession(summary, token).catch(() => undefined);
  const capture = takeCaptureUpload(summary.id);
  if (firstFrameAt === null || !wantsSamples(summary.outcome, firstFrameAt, capturedAt)) return;
  await capture;
  const got = await Promise.all(samples.map((s) => s.sampled));
  let seq = 0;
  for (const [i, s] of got.entries()) {
    if (!s) continue;
    const meta = sampleMeta(s, samples[i]!.at, firstFrameAt, summary.modelId);
    try {
      await uploadRecognitionSample(summary.id, seq, s.blob, meta, token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) return;
    }
    seq += 1;
  }
}
