import type * as OrtModule from "onnxruntime-web/wasm";
import type { InferenceSession } from "onnxruntime-web/wasm";
import { modelUrl } from "./modelUrl";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

type Ort = typeof OrtModule;

export interface Detector {
  ort: Ort;
  session: InferenceSession;
}

/**
 * 浏览器端推理会话：懒加载 onnxruntime-web（纯 WASM 入口，代码分割），模型从 CDN 取（immutable 缓存）。
 * 单线程：多线程要 crossOriginIsolated，COS/CDN 托管的前端没有 COOP/COEP 头。
 * 加载失败时清掉单例，下次点击重试。
 */
let pending: Promise<Detector> | null = null;
let pendingId: string | null = null;

export function loadDetector(modelId: string): Promise<Detector> {
  if (pending && pendingId === modelId) return pending;
  pendingId = modelId;
  pending = (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: wasmUrl };
    const session = await ort.InferenceSession.create(modelUrl(modelId), {
      executionProviders: ["wasm"],
    });
    return { ort, session };
  })();
  pending.catch(() => {
    pending = null;
    pendingId = null;
  });
  return pending;
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
