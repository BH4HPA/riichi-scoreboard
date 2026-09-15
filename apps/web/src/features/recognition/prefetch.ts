import { RECOGNITION_MANIFEST } from "@riichi/core";

/**
 * 进房间后静默预热识别模型：约 25 MB 的下载放在牌局开始前的空闲时间，识别时就不用等。
 * onnxruntime-web 的代码块也在这里才加载（按需 import），主控台与首页不受影响。
 * 失败静默：识别时会重试并把错误展示给用户。
 */
export function prefetchDetector(): void {
  const model = RECOGNITION_MANIFEST.model;
  if (!model) return;
  void import("./ort").then(({ loadDetector }) => loadDetector(model.id).catch(() => undefined));
}
