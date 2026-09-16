import { fetchBytes } from "@/lib/fetchProgress";
import { modelUrl } from "../modelUrl";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

export interface DetectorBytes {
  wasm: Uint8Array;
  model: Uint8Array;
}

/** 0–1：运行时（约 14 MB）与模型（约 10 MB）合并的下载进度 */
export type LoadProgress = (fraction: number) => void;

/**
 * 模型与运行时的字节**留在主线程下载**，Worker 只拿现成的字节建会话。三个理由：
 * 1. 这套「预热静默开始、界面中途订阅也能看到当前进度」的重放逻辑原样保住，不用在 Worker 里重做；
 * 2. e2e 靠 `page.route` 把模型 URL 换成假检测器，主线程发起的请求一定拦得到；
 * 3. Worker 只剩纯计算，随开随关，重建不用重新下载。
 * 失败时清掉单例，下次调用重试。
 */
let pending: Promise<DetectorBytes> | null = null;
let pendingId: string | null = null;
let wasmBinary: Uint8Array | null = null;
let fraction = 0;
const listeners = new Set<LoadProgress>();

function start(modelId: string): Promise<DetectorBytes> {
  if (pending && pendingId === modelId) return pending;
  pendingId = modelId;
  fraction = 0;
  const attempt = (async () => {
    const loaded = [0, 0];
    const total = [0, 0];
    const report = (i: number) => (l: number, t: number) => {
      // 失败后的重试会开新一轮下载；上一轮还在流式读取的 fetch 不能再写进度
      if (pending !== attempt) return;
      loaded[i] = l;
      total[i] = t;
      const sum = total[0]! + total[1]!;
      if (sum === 0) return;
      fraction = (loaded[0]! + loaded[1]!) / sum;
      listeners.forEach((fn) => fn(fraction));
    };
    const [wasm, model] = await Promise.all([
      wasmBinary
        ? Promise.resolve(wasmBinary)
        : fetchBytes(wasmUrl, report(0)).then((r) => (wasmBinary = r.bytes)),
      fetchBytes(modelUrl(modelId), report(1)).then((r) => r.bytes),
    ]);
    return { wasm, model };
  })();
  pending = attempt;
  attempt.catch(() => {
    if (pending !== attempt) return;
    pending = null;
    pendingId = null;
  });
  return attempt;
}

export function loadBytes(modelId: string, onProgress?: LoadProgress): Promise<DetectorBytes> {
  const p = start(modelId);
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(fraction);
    void p.finally(() => listeners.delete(onProgress)).catch(() => undefined);
  }
  return p;
}
