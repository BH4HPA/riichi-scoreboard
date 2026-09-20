import type { Rotation } from "../camera/orientation/upright";
import type {
  Box,
  Detection,
  FrameSize,
  HandProvenance,
  RecognitionWarning,
  RecognizedHand,
} from "@riichi/core";

/** 主线程 → Worker */
export type ToWorker =
  | { type: "init"; wasm: Uint8Array; model: Uint8Array; imgsz: number }
  /**
   * bitmap 是**整帧**，随消息转移；识别哪一块由 Worker 自己定（见 runFrame）。
   * rotation = 界面转了多少度（手机横持而页面没跟着转时，帧是躺着的，识别前先转正）。
   * upright = 转正以后画面确实是正的（方向由陀螺仪或用户定过）。没人定过方向时为 false：
   * 旋转锁开着横持的人以前靠布局的「多数框宽 > 高 ⇒ 竖拍」投票兜住，这条兜底要留着。
   * still = 相册里挑的一张：不沿用取景时锁定的范围，方向同样未知。
   */
  | {
      type: "infer";
      frameId: number;
      bitmap: ImageBitmap;
      rotation: Rotation;
      upright: boolean;
      still: boolean;
    }
  /** 把 Worker 手上最近跑完的那一帧收紧、编码回来 */
  | { type: "grab"; quality: number };

/** 一帧的识别结果；检测框是**转正后整帧**的像素坐标（覆盖层按 rotation 转回去再画到屏幕上） */
export interface FrameResult {
  frameId: number;
  ms: number;
  detections: Detection[];
  hand: RecognizedHand;
  warnings: RecognitionWarning[];
  provenance: HandProvenance;
  /** 转正后的帧尺寸 */
  frame: FrameSize;
  /** 这一帧是按哪个方向转正的 */
  rotation: Rotation;
  /** 最后一遍实际识别的那一块 */
  crop: Box;
  /** 这一块已经收紧到手牌周围、再裁也放大不了多少：结果可以拿去定格 */
  settled: boolean;
  /** 这一帧推理了几遍 */
  passes: number;
}

/**
 * 定格的产物：照片、检测框、识别结果出自同一帧，检测框已平移到**照片**的像素坐标——
 * 上传的就是这三样，回流靠它们对齐。
 */
export interface Grabbed {
  frameId: number;
  blob: Blob;
  ms: number;
  detections: Detection[];
  hand: RecognizedHand;
  warnings: RecognitionWarning[];
  provenance: HandProvenance;
}

/** Worker → 主线程 */
export type FromWorker =
  | { type: "ready" }
  | { type: "failed"; message: string }
  | ({ type: "result" } & FrameResult)
  | ({ type: "grabbed" } & Grabbed)
  /** 上一帧还在推理，这一帧被背压丢掉了 */
  | { type: "dropped"; frameId: number }
  | { type: "grab-miss" };
