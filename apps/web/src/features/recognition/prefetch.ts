import { RECOGNITION_MANIFEST } from "@riichi/core";
import { loadDetector } from "./ort";

/**
 * 进房间后静默预热识别模型：约 25 MB 的下载放在牌局开始前的空闲时间，识别时就不用等。
 * onnxruntime-web 本身在 loadDetector 里按需 import，主控台与首页不会加载它。
 * 失败静默：识别时会重试并把错误展示给用户。
 */
export function prefetchDetector(): void {
  const model = RECOGNITION_MANIFEST.model;
  if (!model) return;
  // 省流量模式不预热，识别时再按需下载
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return;
  loadDetector(model.id).catch(() => undefined);
}
