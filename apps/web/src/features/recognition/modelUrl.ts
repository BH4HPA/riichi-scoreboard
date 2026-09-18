import { RECOGNITION_MANIFEST, type RecognitionModel } from "@riichi/core";
import { STATIC_BASE_URL } from "@/lib/staticUrl";

/** 当前可用的识别模型：manifest 里有发布记录且部署方配了静态桶；否则界面不给识别入口。 */
export const RECOGNITION_MODEL: RecognitionModel | null = STATIC_BASE_URL
  ? RECOGNITION_MANIFEST.model
  : null;

/** 模型对象地址；对象名 = manifest 里的 uuid（上传见 ci/upload-model.sh）。 */
export function modelUrl(id: string): string {
  return `${STATIC_BASE_URL}/models/${id}.onnx`;
}
