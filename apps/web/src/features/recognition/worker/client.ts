import { RECOGNITION_MODEL } from "../modelUrl";
import { loadBytes, type LoadProgress } from "./bytes";
import type { FrameResult, FromWorker, Grabbed, ToWorker } from "./protocol";

/** 定格帧编码成 JPEG 的质量，与既有的上传照片一致 */
const JPEG_QUALITY = 0.85;

export interface Detector {
  /** 送一帧（整帧）去推理；bitmap 的所有权转移给 Worker，调用方不要再碰它。still = 相册里挑的一张 */
  infer(bitmap: ImageBitmap, still?: boolean): number;
  /** 取 Worker 手上最近跑完的那一帧：收紧到手牌的 JPEG，连同同一帧的检测框与识别结果 */
  grab(): Promise<Grabbed | null>;
  /** 一帧跑完；r 为 null 表示它被背压丢掉了，调用方据此复位自己的闸门 */
  onResult(fn: (r: FrameResult | null) => void): () => void;
  /** ready 之后才发生的失败（会话崩了、推理抛错）；否则界面会一直显示正常 */
  onError(fn: (message: string) => void): () => void;
  close(): void;
}

/**
 * Worker 的生命周期：**打开取景/识别时建，关掉时销毁**。
 * 预热只下载字节（见 bytes.ts），不建会话——一局牌九成时间用不上，几十 MB 的会话不必常驻。
 * 字节缓存在主线程，所以重建 Worker 不会重新下载。
 * init 失败、onerror、会话创建抛错都直接销毁单例，下次打开重来。
 */
let handle: Promise<Detector> | null = null;
/** 每次 spawn 一个代次：关掉再立刻打开时，上一轮在建的会话凭它识别自己已被放弃 */
let epoch = 0;

function spawn(modelId: string, imgsz: number, onProgress?: LoadProgress): Promise<Detector> {
  const mine = ++epoch;
  const cancelled = () => epoch !== mine;
  // 让出单例时要比对「是不是我这一轮」。run 在闭包里被引用，所以用一个 holder 绕开 TDZ。
  const self: { promise?: Promise<Detector> } = {};
  const release = () => {
    if (handle === self.promise) handle = null;
  };
  const run = (async (): Promise<Detector> => {
    const { wasm, model } = await loadBytes(modelId, onProgress);
    if (cancelled()) throw new Error("已取消");
    const worker = new Worker(new URL("./detector.worker.ts", import.meta.url), {
      type: "module",
    });
    const results = new Set<(r: FrameResult | null) => void>();
    const errors = new Set<(message: string) => void>();
    let grabbing: ((v: Grabbed | null) => void) | null = null;
    let frameId = 0;
    let dead: string | null = null;

    const ready = new Promise<void>((resolve, reject) => {
      // 会话废了就地销毁并让出单例；ready 之后由 dead 挡住后续调用
      const die = (message: string) => {
        dead = message;
        grabbing?.(null);
        grabbing = null;
        worker.terminate();
        release();
        // ready 之后 reject 是空操作，所以失败必须另有出口，否则取景页照旧像正常工作一样
        errors.forEach((fn) => fn(message));
        results.forEach((fn) => fn(null));
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
          case "dropped":
            return results.forEach((fn) => fn(null));
          case "grabbed":
            grabbing?.(msg);
            grabbing = null;
            return;
          case "grab-miss":
            grabbing?.(null);
            grabbing = null;
            return;
        }
      };
      // **两份字节都只能克隆，不能转移**：它们同属 bytes.ts 里那个永不清空的下载缓存，
      // 转移一次就把 ArrayBuffer detach 掉，第二次打开取景框时 postMessage 会抛 DataCloneError。
      // 克隆 24 MB 只发生在建线程那一下，换来的是「再拍一张」和算点数页连拍能用。
      const init: ToWorker = { type: "init", wasm, model, imgsz };
      worker.postMessage(init);
    });

    await ready;
    // 建线程期间用户已经关掉了取景页：立刻收摊，不要留下一个没人管的会话
    if (cancelled()) {
      worker.terminate();
      release();
      throw new Error("已取消");
    }

    return {
      infer(bitmap, still = false) {
        const id = ++frameId;
        if (dead) {
          bitmap.close();
          return id;
        }
        const msg: ToWorker = { type: "infer", frameId: id, bitmap, still };
        worker.postMessage(msg, [bitmap]);
        return id;
      },
      grab() {
        if (dead) return Promise.resolve(null);
        // 同时只允许一个 grab 在途：后来的顶掉前一个，但前一个必须先结掉，
        // 否则它的 Promise 永远不会 settle，调用方就挂住了
        grabbing?.(null);
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
      onError(fn) {
        errors.add(fn);
        return () => errors.delete(fn);
      },
      close() {
        // 先标死再清：否则 close 之后再调 grab 会返回一个永不 settle 的 Promise
        dead = "closed";
        results.clear();
        errors.clear();
        grabbing?.(null);
        grabbing = null;
        worker.terminate();
        release();
      },
    };
  })();
  self.promise = run;
  run.catch(release);
  return run;
}

/** 取（或创建）识别线程。模型未发布时抛错。 */
export function openDetector(onProgress?: LoadProgress): Promise<Detector> {
  const model = RECOGNITION_MODEL;
  if (!model) return Promise.reject(new Error("尚未发布识别模型"));
  if (!handle) return (handle = spawn(model.id, model.imgsz, onProgress));
  // 线程已在建：字节可能还在下，把进度回调挂到那一轮下载上（loadBytes 会立刻重放当前进度）
  if (onProgress) void loadBytes(model.id, onProgress).catch(() => undefined);
  return handle;
}

/** 关掉识别线程（取景页卸载时调用）；还在建的那一轮见到代次变了会自行收摊。 */
export function closeDetector(): void {
  const current = handle;
  handle = null;
  epoch += 1;
  void current?.then((d) => d.close()).catch(() => undefined);
}
