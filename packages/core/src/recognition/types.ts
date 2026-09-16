import type { HandInput } from "../types/state";

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
  | "odd_box";

/**
 * 分两档，**在发出处指定**而不是按 code 查表：同一个 code 在不同上下文语义不同
 * （`too_many_dora` / `extra_rows` 也被 web 层用来发「已按房间规则截断」「认出里宝已勾立直」这类信息）。
 * - `blocking` 结果不自洽，用户必须动手：生产界面红字 + 强制展开全键盘。
 * - `info` 结果已自洽，模型在汇报自己的内务：生产界面不渲染，只在标注模式展示。
 */
export type RecognitionSeverity = "blocking" | "info";

export interface RecognitionWarning {
  code: RecognitionWarningCode;
  message: string;
  severity: RecognitionSeverity;
}

/** 一张牌的来源：det = 检测框在 `RecognitionResult.detections` 里的下标，-1 表示这张牌是补出来的。 */
export interface TileOrigin {
  det: number;
  /** 布局时靠规则猜出来的（和张位置有歧义、暗杠两张不一致、杠里按同牌补齐） */
  guessed: boolean;
}

/**
 * 与 `RecognizedHand` 平行的来源信息：每张牌来自哪个检测框。
 * 两个消费者：界面据此给没把握的牌打记号；数据回流据此把用户改正后的牌写回对应的框。
 */
export interface HandProvenance {
  /** 与 hand.closed 同长同序（和张在末位） */
  closed: TileOrigin[];
  /** 与 hand.melds[i].tiles 同长同序 */
  melds: TileOrigin[][];
  doraIndicators: TileOrigin[];
  uraIndicators: TileOrigin[];
  /** 布局真正采信的全部检测框下标（升序，含被当作牌背消费掉的）；回流据此判断照片里有没有没标注的牌 */
  usedDetections: number[];
  /**
   * 按噪声剔除的框（升序）：置信度低于 minConf、面积退化、宽高比明显异常。
   * 它们不对应真实的牌（评估集里误检在 0.32–0.34，真牌最低 0.60），所以回流时**不该标注**，
   * 也不该因为它们的存在把整条记录降级人工 —— 否则「有框被丢掉」这个常态会让自动入库几乎永不命中。
   */
  rejectedDetections: number[];
}

/** 手机浏览器推理（onnxruntime-web）的一次结果 */
export interface RecognitionResult {
  modelId: string;
  /** 预处理 + 推理 + 布局的耗时（不含模型下载与照片上传） */
  ms: number;
  detections: Detection[];
  hand: RecognizedHand;
  warnings: RecognitionWarning[];
  provenance: HandProvenance;
}

/**
 * 记录来自哪条路：`room` = 牌局里结算时拍的，`label` = 主页标注模式显式提交的真值。
 * 回流时两个群体的可信度不同（房间里靠「结算被牌桌接受」背书，标注模式是用户明说的），
 * 所以导出必须带上这一列。
 */
export type RecognitionSource = "room" | "label";

/** POST /api/recognitions 的响应：照片已存、记录已建 */
export interface RecognitionCreated {
  id: string;
}

/** PATCH /api/recognitions/:id：字段全可选，按给出的合并。 */
export interface RecognitionPatch {
  /** 手机端实际使用的模型（前端打包的 manifest 可能与服务端不同版本） */
  modelId?: string;
  ms?: number;
  detections?: Detection[];
  recognized?: RecognizedHand;
  /** 用户最终提交结算的手牌（训练数据的真值） */
  corrected?: HandInput;
}
