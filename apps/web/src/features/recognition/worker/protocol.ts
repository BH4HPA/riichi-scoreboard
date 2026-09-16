import type { Detection, HandProvenance, RecognitionWarning, RecognizedHand } from "@riichi/core";

/** 主线程 → Worker */
export type ToWorker =
  | { type: "init"; wasm: Uint8Array; model: Uint8Array; imgsz: number }
  /** bitmap 随消息转移；Worker 会留着最近一帧，等 grab 把它编码成 JPEG */
  | { type: "infer"; frameId: number; bitmap: ImageBitmap }
  /** 把 Worker 手上最近那一帧编码回来；回包带 frameId，主线程据此取同一帧的识别结果 */
  | { type: "grab"; quality: number };

/** Worker → 主线程 */
export type FromWorker =
  | { type: "ready" }
  | { type: "failed"; message: string }
  | {
      type: "result";
      frameId: number;
      ms: number;
      detections: Detection[];
      hand: RecognizedHand;
      warnings: RecognitionWarning[];
      provenance: HandProvenance;
    }
  | { type: "grabbed"; frameId: number; blob: Blob }
  | { type: "grab-miss" };

export interface FrameResult {
  frameId: number;
  ms: number;
  detections: Detection[];
  hand: RecognizedHand;
  warnings: RecognitionWarning[];
  provenance: HandProvenance;
}
