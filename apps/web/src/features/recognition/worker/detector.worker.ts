/// <reference lib="webworker" />
import type * as OrtModule from "onnxruntime-web/wasm";
import type { InferenceSession } from "onnxruntime-web/wasm";
import { decodeNmsOutput, layoutHand, RECOGNITION_CLASSES } from "@riichi/core";
import { toModelInput } from "./preprocess";
import type { FromWorker, ToWorker } from "./protocol";

/**
 * 推理 Worker：只做「字节 → 会话」与「位图 → 检测框 → 布局」。下载、进度、重试都在主线程。
 * 每帧 300 ms 的推理放主线程会让相机预览卡成幻灯片，所以取景框必须走这里。
 *
 * 留着最近一帧的位图不 close：自动定格时主线程只发一个 frameId，由这里把**那一帧**
 * 编码成 JPEG 回传。照片与检测框必须是同一帧，否则回流出来的训练数据是错位的。
 */
let ort: typeof OrtModule | null = null;
let session: InferenceSession | null = null;
let imgsz = 640;

let held: { frameId: number; bitmap: ImageBitmap } | null = null;
/** 上一帧还在推理时新帧直接丢掉：背压，不排队 */
let busy = false;

const post = (msg: FromWorker, transfer?: Transferable[]) =>
  transfer ? self.postMessage(msg, transfer) : self.postMessage(msg);

function hold(frameId: number, bitmap: ImageBitmap): void {
  held?.bitmap.close();
  held = { frameId, bitmap };
}

async function init(wasm: Uint8Array, model: Uint8Array, size: number): Promise<void> {
  imgsz = size;
  ort = await import("onnxruntime-web/wasm");
  // 单线程：多线程要 crossOriginIsolated，COS/CDN 托管的前端没有 COOP/COEP 头
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = wasm;
  session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
}

async function infer(frameId: number, bitmap: ImageBitmap): Promise<void> {
  if (!ort || !session) return;
  const t0 = performance.now();
  const { data, geom } = toModelInput(bitmap, imgsz);
  const input = new ort.Tensor("float32", data, [1, 3, imgsz, imgsz]);
  const outputs = await session.run({ [session.inputNames[0]!]: input });
  const output = outputs[session.outputNames[0]!]!.data as Float32Array;
  const detections = decodeNmsOutput(output, geom, RECOGNITION_CLASSES.length);
  const { hand, warnings, provenance } = layoutHand(detections);
  post({
    type: "result",
    frameId,
    ms: Math.round(performance.now() - t0),
    detections,
    hand,
    warnings,
    provenance,
  });
}

async function grab(quality: number): Promise<void> {
  if (!held) return post({ type: "grab-miss" });
  const { bitmap } = held;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  // 必须显式指定类型：convertToBlob 默认出 PNG，同尺寸能大 10 倍，会撞服务端 2 MB 的上限
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  post({ type: "grabbed", frameId: held.frameId, blob });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  void (async () => {
    try {
      switch (msg.type) {
        case "init":
          await init(msg.wasm, msg.model, msg.imgsz);
          post({ type: "ready" });
          return;
        case "infer":
          if (busy || !session) return msg.bitmap.close();
          hold(msg.frameId, msg.bitmap);
          busy = true;
          try {
            await infer(msg.frameId, msg.bitmap);
          } finally {
            busy = false;
          }
          return;
        case "grab":
          await grab(msg.quality);
          return;
      }
    } catch (err) {
      post({ type: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  })();
};
