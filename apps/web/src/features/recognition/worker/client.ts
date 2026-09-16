import { RECOGNITION_MANIFEST } from "@riichi/core";
import { loadBytes, type LoadProgress } from "./bytes";
import type { FrameResult, FromWorker, ToWorker } from "./protocol";

/** 定格帧编码成 JPEG 的质量，与既有的上传照片一致 */
const JPEG_QUALITY = 0.85;

export interface Detector {
  /** 送一帧去推理；bitmap 的所有权转移给 Worker，调用方不要再碰它 */
  infer(bitmap: ImageBitmap): number;
  /** 取 Worker 手上最近那一帧的 JPEG；返回的 frameId 用来取同一帧的识别结果 */
  grab(): Promise<{ frameId: number; blob: Blob } | null>;
  onResult(fn: (r: FrameResult) => void): () => void;
  close(): void;
}

/**
 * Worker 的生命周期：**打开取景/识别时建，关掉时销毁**。
 * 预热只下载字节（见 bytes.ts），不建会话——一局牌九成时间用不上，几十 MB 的会话不必常驻。
 * 字节缓存在主线程，所以重建 Worker 不会重新下载。
 * init 失败、onerror、会话创建抛错都直接销毁单例，下次打开重来。
 */
let handle: Promise<Detector> | null = null;

function spawn(modelId: string, imgsz: number, onProgress?: LoadProgress): Promise<Detector> {
  const attempt = (async (): Promise<Detector> => {
    const { wasm, model } = await loadBytes(modelId, onProgress);
    const worker = new Worker(new URL("./detector.worker.ts", import.meta.url), {
      type: "module",
    });
    const results = new Set<(r: FrameResult) => void>();
    let grabbing: ((v: { frameId: number; blob: Blob } | null) => void) | null = null;
    let frameId = 0;
    let dead: string | null = null;

    const ready = new Promise<void>((resolve, reject) => {
      // 会话废了就地销毁并让出单例：ready 之后才失败时 reject 是空操作，靠 dead 挡住后续调用
      const die = (message: string) => {
        dead = message;
        grabbing?.(null);
        grabbing = null;
        worker.terminate();
        if (handle === attempt) handle = null;
        reject(new Error(message));
      };
      worker.onerror = (e) => die(e.message || "识别线程启动失败");
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        switch (msg.type) {
          case "ready":
            return resolve();
          case "failed":
            return die(msg.message);
          case "result":
            return results.forEach((fn) => fn(msg));
          case "grabbed":
            grabbing?.({ frameId: msg.frameId, blob: msg.blob });
            grabbing = null;
            return;
          case "grab-miss":
            grabbing?.(null);
            grabbing = null;
            return;
        }
      };
      // wasm 那 14 MB 只能克隆不能转移：它是主线程的重试缓存，转移会把 ArrayBuffer detach 掉。
      // 模型字节没有缓存、只用一次，可以转移。
      const init: ToWorker = { type: "init", wasm, model, imgsz };
      worker.postMessage(init, [model.buffer as ArrayBuffer]);
    });

    await ready;

    return {
      infer(bitmap) {
        const id = ++frameId;
        if (dead) {
          bitmap.close();
          return id;
        }
        const msg: ToWorker = { type: "infer", frameId: id, bitmap };
        worker.postMessage(msg, [bitmap]);
        return id;
      },
      grab() {
        if (dead) return Promise.resolve(null);
        return new Promise((resolve) => {
          grabbing = resolve;
          const msg: ToWorker = { type: "grab", quality: JPEG_QUALITY };
          worker.postMessage(msg);
        });
      },
      onResult(fn) {
        results.add(fn);
        return () => results.delete(fn);
      },
      close() {
        results.clear();
        grabbing?.(null);
        worker.terminate();
        if (handle === attempt) handle = null;
      },
    };
  })();
  attempt.catch(() => {
    if (handle === attempt) handle = null;
  });
  return attempt;
}

/** 取（或创建）识别线程。模型未发布时抛错。 */
export function openDetector(onProgress?: LoadProgress): Promise<Detector> {
  const model = RECOGNITION_MANIFEST.model;
  if (!model) return Promise.reject(new Error("尚未发布识别模型"));
  if (!handle) return (handle = spawn(model.id, model.imgsz, onProgress));
  // 线程已在建：字节可能还在下，把进度回调挂到那一轮下载上（loadBytes 会立刻重放当前进度）
  if (onProgress) void loadBytes(model.id, onProgress).catch(() => undefined);
  return handle;
}

/** 关掉识别线程（取景页卸载时调用）。 */
export function closeDetector(): void {
  const current = handle;
  handle = null;
  void current?.then((d) => d.close()).catch(() => undefined);
}
