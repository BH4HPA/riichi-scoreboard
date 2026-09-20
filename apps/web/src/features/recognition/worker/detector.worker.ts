/// <reference lib="webworker" />
import type * as OrtModule from "onnxruntime-web/wasm";
import type { InferenceSession } from "onnxruntime-web/wasm";
import {
  decodeNmsOutput,
  LOST,
  RECOGNITION_CLASSES,
  RECOGNITION_PHOTO_MAX_BYTES,
  tightenCapture,
  type Box,
  type Detection,
  type LayoutResult,
  type TrackState,
} from "@riichi/core";
import { uprightSize, type Rotation } from "../camera/orientation/upright";
import { drawUpright, toModelInput } from "./preprocess";
import type { FromWorker, ToWorker } from "./protocol";
import { runFrame } from "./runFrame";

/**
 * 推理 Worker：只做「字节 → 会话」与「整帧 → 找到手牌 → 检测框 → 布局」。下载、进度、重试都在主线程。
 * 每帧 300 ms 的推理放主线程会让相机预览卡成幻灯片，所以取景框必须走这里。
 *
 * 留着最近**跑完**的那一帧不 close：自动定格时由这里把那一帧收紧到手牌、编码成 JPEG 回传。
 * 照片、检测框、识别结果必须出自同一帧，否则回流出来的训练数据是错位的——所以三样一起存、一起换。
 */
let ort: typeof OrtModule | null = null;
let session: InferenceSession | null = null;
let imgsz = 640;

interface Held {
  frameId: number;
  bitmap: ImageBitmap;
  rotation: Rotation;
  ms: number;
  /** 整帧坐标 */
  detections: Detection[];
  layout: LayoutResult;
  crop: Box;
}
let held: Held | null = null;
/** 取景时锁定的识别范围，跨帧沿用；手机一转坐标系就变了，作废重找 */
let track: TrackState = LOST;
let trackRotation: Rotation = 0;
/** 上一帧还在推理时新帧直接丢掉：背压，不排队 */
let busy = false;

const post = (msg: FromWorker, transfer?: Transferable[]) =>
  transfer ? self.postMessage(msg, transfer) : self.postMessage(msg);

async function init(wasm: Uint8Array, model: Uint8Array, size: number): Promise<void> {
  // iOS 16.3 及更早没有 OffscreenCanvas，会在第一帧推理时才抛 ReferenceError —— 那时界面已经
  // 取景页看着正常，用户只看到永远不动的黑屏。提前到 init 里失败，走已有的错误展示。
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("拍照识别需要 iOS 16.4 或更新的系统");
  }
  imgsz = size;
  ort = await import("onnxruntime-web/wasm");
  // 单线程：多线程要 crossOriginIsolated，COS/CDN 托管的前端没有 COOP/COEP 头
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = wasm;
  session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
}

/** 识别整帧里的一块；框从块内坐标平移回整帧坐标 */
async function detect(bitmap: ImageBitmap, crop: Box, rotation: Rotation): Promise<Detection[]> {
  const { data, geom } = toModelInput(bitmap, crop, rotation, imgsz);
  const input = new ort!.Tensor("float32", data, [1, 3, imgsz, imgsz]);
  const outputs = await session!.run({ [session!.inputNames[0]!]: input });
  const output = outputs[session!.outputNames[0]!]!.data as Float32Array;
  return decodeNmsOutput(output, geom, RECOGNITION_CLASSES.length).map((d) => ({
    ...d,
    box: [d.box[0] + crop[0], d.box[1] + crop[1], d.box[2] + crop[0], d.box[3] + crop[1]],
  }));
}

async function infer(
  frameId: number,
  bitmap: ImageBitmap,
  rotation: Rotation,
  upright: boolean,
  still: boolean,
): Promise<void> {
  if (!ort || !session) return bitmap.close();
  const t0 = performance.now();
  const frame = uprightSize(bitmap, rotation);
  if (!still && rotation !== trackRotation) {
    track = LOST;
    trackRotation = rotation;
  }
  // 相册那张与取景无关：不沿用锁定的范围，也不改写取景的跟踪状态
  const out = await runFrame(
    (crop) => detect(bitmap, crop, rotation),
    frame,
    still ? LOST : track,
    upright,
  ).catch((err: unknown) => {
    bitmap.close();
    throw err;
  });
  if (!still) track = out.track;
  const ms = Math.round(performance.now() - t0);
  held?.bitmap.close();
  held = {
    frameId,
    bitmap,
    rotation,
    ms,
    detections: out.detections,
    layout: out.layout,
    crop: out.crop,
  };
  post({
    type: "result",
    frameId,
    ms,
    detections: out.detections,
    hand: out.layout.hand,
    warnings: out.layout.warnings,
    provenance: out.layout.provenance,
    frame,
    rotation,
    crop: out.crop,
    settled: out.settled,
    passes: out.passes,
  });
}

async function grab(quality: number): Promise<void> {
  if (!held) return post({ type: "grab-miss" });
  // 整个 held 一次取走：下面 await 编码时新帧会把它换掉，之后再读就会回出「新帧的结果 + 旧帧的像素」
  const { bitmap, rotation, frameId, ms, detections, layout, crop } = held;
  const frame = uprightSize(bitmap, rotation);
  // 收紧到被采信的牌；收紧会改变手牌时（牌河紧贴着指示牌）退回识别用的那一块，框只平移不筛
  const tight = tightenCapture(detections, layout, frame);
  const box = tight?.box ?? crop;
  const shot = tight ?? {
    layout,
    detections: detections.map((d) => ({
      ...d,
      box: [d.box[0] - box[0], d.box[1] - box[1], d.box[2] - box[0], d.box[3] - box[1]],
    })) as Detection[],
  };
  const [w, h] = [box[2] - box[0], box[3] - box[1]];
  const canvas = new OffscreenCanvas(w, h);
  drawUpright(canvas.getContext("2d")!, bitmap, box, rotation, { x: 0, y: 0, width: w, height: h });
  // 必须显式指定类型：convertToBlob 默认出 PNG，同尺寸能大 10 倍，会撞服务端 2 MB 的上限。
  // 纹理密的画面（桌布、噪点）同尺寸 JPEG 也可能超：按字节兜底，逐级降质量，任何来源的帧都成立
  let blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  for (const q of [0.7, 0.5, 0.3]) {
    if (blob.size <= RECOGNITION_PHOTO_MAX_BYTES || q >= quality) continue;
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q });
  }
  const { hand, warnings, provenance } = shot.layout;
  post({
    type: "grabbed",
    frameId,
    blob,
    ms,
    detections: shot.detections,
    hand,
    warnings,
    provenance,
  });
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
          // 丢帧也要回包：主线程的背压闸门只在收到结果时复位，静默丢弃会让循环永久停摆
          if (busy || !session) {
            msg.bitmap.close();
            return post({ type: "dropped", frameId: msg.frameId });
          }
          busy = true;
          try {
            await infer(msg.frameId, msg.bitmap, msg.rotation, msg.upright, msg.still);
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
