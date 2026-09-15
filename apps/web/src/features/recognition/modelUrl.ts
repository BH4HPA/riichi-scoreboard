import { STATIC_BASE_URL } from "@/lib/staticUrl";

/** 模型对象地址；对象名 = manifest 里的 uuid（上传见 ci/upload-model.sh）。 */
export function modelUrl(id: string): string {
  return `${STATIC_BASE_URL}/models/${id}.onnx`;
}
