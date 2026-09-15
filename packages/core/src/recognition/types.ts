import type { HandInput } from "../types/state";

/** 推理跑在哪：手机浏览器（onnxruntime-web）或服务器（onnxruntime-node）。 */
export type RecognitionEngine = "browser" | "server";

/** 一张牌的检测框：类 id = manifest.classes 下标；box 是裁剪后照片的像素坐标 x1 y1 x2 y2。 */
export interface Detection {
  cls: number;
  conf: number;
  box: [number, number, number, number];
}

/** 照片能填的字段；立直等旗标沿用对话框里已选的。 */
export type RecognizedHand = Pick<
  HandInput,
  "closed" | "melds" | "winTile" | "doraIndicators" | "uraIndicators"
>;

export type RecognitionWarningCode =
  | "no_tiles"
  | "count"
  | "no_win_tile"
  | "multi_win"
  | "back_in_hand"
  | "bad_group"
  | "extra_rows"
  | "too_many_dora"
  | "kan_mismatch"
  | "odd_box"
  | "low_conf";

export interface RecognitionWarning {
  code: RecognitionWarningCode;
  message: string;
}

export interface RecognitionResult {
  engine: RecognitionEngine;
  modelId: string;
  /** 预处理 + 推理 + 布局的耗时（不含模型下载与照片上传） */
  ms: number;
  detections: Detection[];
  hand: RecognizedHand;
  warnings: RecognitionWarning[];
}

/** POST /api/recognitions 的响应；`?infer=1` 时带服务器引擎的结果 */
export interface RecognitionCreated {
  id: string;
  result: RecognitionResult | null;
}

/** PATCH /api/recognitions/:id：字段全可选，按给出的合并。 */
export interface RecognitionPatch {
  engine?: RecognitionEngine;
  /** 手机端实际使用的模型（前端打包的 manifest 可能与服务端不同版本） */
  modelId?: string;
  ms?: number;
  detections?: Detection[];
  recognized?: RecognizedHand;
  /** 用户最终提交结算的手牌（训练数据的真值） */
  corrected?: HandInput;
}
