/** 模型对象所在的公网地址；对象名 = manifest 里的 uuid（上传见 ci/upload-model.sh，两处前缀须一致）。 */
const MODEL_BASE_URL = "https://static.bitego.net/riichi/models";

export function modelUrl(id: string): string {
  return `${MODEL_BASE_URL}/${id}.onnx`;
}
