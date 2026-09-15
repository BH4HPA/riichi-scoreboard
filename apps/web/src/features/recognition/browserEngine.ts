import {
  decodeNmsOutput,
  layoutHand,
  RECOGNITION_CLASSES,
  RECOGNITION_MANIFEST,
  type RecognitionResult,
} from "@riichi/core";
import { loadDetector, runDetector } from "./ort";
import { toModelInput } from "./preprocess";

export type BrowserPhase = "loading-model" | "running";

/** 本机推理：加载模型（首次含下载）→ 预处理 → 推理 → 解码 → 布局。ms 只算后三步。 */
export async function recognizeInBrowser(
  bitmap: ImageBitmap,
  onPhase?: (phase: BrowserPhase) => void,
): Promise<RecognitionResult> {
  const model = RECOGNITION_MANIFEST.model;
  if (!model) throw new Error("尚未发布识别模型");
  onPhase?.("loading-model");
  const detector = await loadDetector(model.id);
  onPhase?.("running");
  const t0 = performance.now();
  const { data, geom } = toModelInput(bitmap, model.imgsz);
  const output = await runDetector(detector, data, model.imgsz);
  const detections = decodeNmsOutput(output, geom, RECOGNITION_CLASSES.length);
  const { hand, warnings } = layoutHand(detections);
  return {
    engine: "browser",
    modelId: model.id,
    ms: Math.round(performance.now() - t0),
    detections,
    hand,
    warnings,
  };
}
