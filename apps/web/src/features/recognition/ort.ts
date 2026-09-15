import type * as OrtModule from "onnxruntime-web/wasm";
import type { InferenceSession } from "onnxruntime-web/wasm";
import { fetchBytes } from "@/lib/fetchProgress";
import { modelUrl } from "./modelUrl";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

type Ort = typeof OrtModule;

export interface Detector {
  ort: Ort;
  session: InferenceSession;
}

/** 0–1：运行时（约 14 MB）与模型（约 10 MB）合并的下载进度 */
export type LoadProgress = (fraction: number) => void;

/**
 * 浏览器端推理会话：懒加载 onnxruntime-web（纯 WASM 入口，代码分割）；运行时 wasm 与模型都由我们自己
 * 整文件 fetch（带进度，浏览器 HTTP 缓存 + CDN immutable 头保证只慢第一次），再交给 ORT。
 * 单线程：多线程要 crossOriginIsolated，COS/CDN 托管的前端没有 COOP/COEP 头。
 * 进房间时静默预热（不带回调）；识别时若还没好，再挂上回调就能接着看到当前进度。
 * 加载失败时清掉单例，下次调用重试。
 */
let pending: Promise<Detector> | null = null;
let pendingId: string | null = null;
let wasmBinary: Uint8Array | null = null;
let fraction = 0;
const listeners = new Set<LoadProgress>();

function start(modelId: string): Promise<Detector> {
  if (pending && pendingId === modelId) return pending;
  pendingId = modelId;
  fraction = 0;
  pending = (async () => {
    const loaded = [0, 0];
    const total = [0, 0];
    const report = (i: number) => (l: number, t: number) => {
      loaded[i] = l;
      total[i] = t;
      const sum = total[0]! + total[1]!;
      if (sum === 0) return;
      fraction = (loaded[0]! + loaded[1]!) / sum;
      listeners.forEach((fn) => fn(fraction));
    };
    const [ort, wasm, model] = await Promise.all([
      import("onnxruntime-web/wasm"),
      wasmBinary
        ? Promise.resolve(wasmBinary)
        : fetchBytes(wasmUrl, report(0)).then((r) => r.bytes),
      fetchBytes(modelUrl(modelId), report(1)).then((r) => r.bytes),
    ]);
    wasmBinary = wasm;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmBinary = wasm;
    const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    return { ort, session };
  })();
  pending.catch(() => {
    pending = null;
    pendingId = null;
  });
  return pending;
}

export function loadDetector(modelId: string, onProgress?: LoadProgress): Promise<Detector> {
  const p = start(modelId);
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(fraction);
    void p.finally(() => listeners.delete(onProgress)).catch(() => undefined);
  }
  return p;
}

/** 跑一次：输入 CHW float32，输出端到端导出的 [1, 300, 6]。 */
export async function runDetector(
  { ort, session }: Detector,
  data: Float32Array,
  size: number,
): Promise<Float32Array> {
  const input = new ort.Tensor("float32", data, [1, 3, size, size]);
  const outputs = await session.run({ [session.inputNames[0]!]: input });
  return outputs[session.outputNames[0]!]!.data as Float32Array;
}
