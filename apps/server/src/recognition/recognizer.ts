import type { RecognitionResult } from "@riichi/core";

/**
 * 服务器端识别引擎（onnxruntime-node 实现另见后续 PR）。
 * 未注入或未就绪时，`POST /api/recognitions?infer=1` 回 503，手机端退回本机推理。
 */
export interface ServerRecognizer {
  ready(): boolean;
  /** 输入裁剪后的 JPEG；忙时可抛 RecognizerBusy → 429 */
  recognize(jpeg: Uint8Array): Promise<RecognitionResult>;
}

export class RecognizerBusy extends Error {
  constructor() {
    super("识别队列已满，请稍后再试");
    this.name = "RecognizerBusy";
  }
}
