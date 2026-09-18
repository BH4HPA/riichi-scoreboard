import { RECOGNITION_MODEL } from "./modelUrl";
import { loadBytes } from "./worker/bytes";

/**
 * 进房间后静默预热：约 25 MB 的运行时与模型放在牌局开始前的空闲时间下，识别时就不用等。
 * **只下载字节，不建线程也不建推理会话**——一局牌九成时间用不上，几十 MB 的会话不必常驻；
 * 字节缓存在主线程，打开取景时建 Worker 直接拿现成的。
 * onnxruntime-web 本身是 Worker 里按需 import 的，主控台与首页不会加载它。
 * 失败静默：识别时会重试并把错误展示给用户。
 */
export function prefetchDetector(): void {
  const model = RECOGNITION_MODEL;
  if (!model) return;
  // 省流量模式不预热，识别时再按需下载
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return;
  loadBytes(model.id).catch(() => undefined);
}
