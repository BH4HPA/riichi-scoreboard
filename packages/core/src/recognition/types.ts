import type { HandInput } from "../types/state";
import type { FrameSize } from "./roi";

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

export const RECOGNITION_WARNING_CODES = [
  "no_tiles",
  "count",
  "no_win_tile",
  "multi_win",
  "back_in_hand",
  "bad_group",
  "extra_rows",
  "too_many_dora",
  "indicator_mismatch",
  "kan_mismatch",
  "odd_box",
] as const;
export type RecognitionWarningCode = (typeof RECOGNITION_WARNING_CODES)[number];

/**
 * 分两档，**在发出处指定**而不是按 code 查表：同一个 code 在不同上下文语义不同
 * （`too_many_dora` / `extra_rows` 也被 web 层用来发「已按房间规则截断」「认出里宝已勾立直」这类信息）。
 * - `blocking` 结果不自洽，用户必须动手：生产界面红字 + 强制展开全键盘。
 * - `info` 结果已自洽，模型在汇报自己的内务：任何界面都不渲染，也不随 PATCH 留存。
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
 * 记录来自哪条路，回流时三个群体的可信度不同，所以导出必须带上这一列：
 * - `room` = 牌局里结算时拍的，靠「结算被牌桌接受」背书；
 * - `label` = 已下线的开发者标注页显式提交的真值（历史记录，新前端不再写）；
 * - `calc` = 拍照算点数页，玩家点「识别正确」时回填，只有玩家自己把关。
 */
export type RecognitionSource = "room" | "label" | "calc";

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

/** 识别照片上传的字节上限（服务端校验与手机端编码兜底共用） */
export const RECOGNITION_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** 一次取景怎么收场的：自动定格、手按快门、相册选图，或者什么都没拍就关了 */
export type RecognitionSessionOutcome = "auto" | "manual" | "album" | "abandoned";

/**
 * 取景会话 id：16 位小写 hex，由手机端生成。摘要、采样帧、定格记录（`?session=`）都带它，
 * 三者靠它串起来；摘要被限流挡掉时采样帧仍能留下，所以 id 不能等服务端发。
 */
export const RECOGNITION_SESSION_ID = /^[0-9a-f]{16}$/;

/**
 * 一次取景会话的摘要（POST /api/recognition-sessions，取景页关闭时上报一条，本身不含照片）。
 * 留存的识别记录全是「定格成功」的那一帧，认不稳、放弃的会话不留任何痕迹——这条摘要补的就是这个盲区：
 * 花了多久、跑了几帧、几帧算数、被哪条 blocking 挡了多少次、牌面跳了几次。
 */
export interface RecognitionSessionSummary {
  /** 见 RECOGNITION_SESSION_ID；旧前端不带，由服务端生成 */
  id?: string;
  source: RecognitionSource;
  outcome: RecognitionSessionOutcome;
  modelId: string | null;
  durationMs: number;
  /** 出了结果的帧数 / 其中收紧到手牌周围的（可计票的）帧数 / 当场识别了第二遍的帧数 */
  frames: number;
  settledFrames: number;
  secondPasses: number;
  /** 单帧平均耗时（含第二遍） */
  msAvg: number;
  /** 各条 blocking 挡了多少帧（只数可计票的帧） */
  blocking: Partial<Record<RecognitionWarningCode, number>>;
  /** 相邻两个可计票的帧牌面指纹不同的次数：越大说明识别结果越跳 */
  keyChanges: number;
  /** 窗口里同一指纹最多攒到过几票 */
  maxVotes: number;
  /** 收场时界面的方向，及它最后一次是谁定的 */
  rotation: 0 | 90 | 270;
  rotationSource: "none" | "manual" | "gyro";
  /** 相机帧与取景区域的尺寸，"宽x高"；没出过帧时为 "0x0" */
  video: string;
  viewport: string;
}

/**
 * 采样帧：放弃取景、或折腾很久才定格的会话，留几帧**整幅**画面（转正、不收紧）。
 * 定格照只有认成功的那一帧；认不出的画面长什么样，只有这里看得见。
 * 画面状态（没收紧 / 哪条 blocking / 牌面指纹）变了才新开一帧，没变就覆盖最后一帧（首帧除外）；
 * 新开与覆盖都至少隔 SAMPLE_GAP_MS，超出 SAMPLE_MAX 时丢第二帧（首帧与最近的几帧最有信息量）。
 */
export const SAMPLE_MAX = 6;
export const SAMPLE_GAP_MS = 1500;
/** 定格了的会话，从首帧出结果到定格超过这么久才上传采样帧；放弃的会话一律上传 */
export const SAMPLE_AFTER_MS = 10_000;
/** 整帧编码、不收紧（要看的正是认不出来的那些细节，长边见 SAMPLE_MAX_EDGE）；超出照片字节上限时与定格照走同一条降质阶梯 */
export const SAMPLE_JPEG_QUALITY = 0.85;
/** 采样帧长边上限：相机按 ideal 1920 要流，个别设备给得更大，这里封顶（检测框同比缩放） */
export const SAMPLE_MAX_EDGE = 1920;

/**
 * 采样帧的元数据（multipart 的 `meta` 字段）：与照片出自同一帧，检测框是照片（转正后整帧）的像素坐标。
 * 与定格记录不同，这里的识别结果是没通过闸门的，暗牌可能远多于 14 张。
 */
export interface RecognitionSampleMeta {
  /** 手机端实际使用的模型；摘要可能被限流挡掉，所以采样帧自己带着 */
  modelId: string | null;
  /** 距会话首帧出结果的毫秒数 */
  t: number;
  /** 这一帧的识别耗时（含第二遍） */
  ms: number;
  /** 照片尺寸 = 转正后的整帧 */
  frame: FrameSize;
  rotation: 0 | 90 | 270;
  /** 这一帧已收紧到手牌周围（可计票） */
  settled: boolean;
  passes: number;
  detections: Detection[];
  hand: RecognizedHand;
  /** 含 info：采样帧就是拿来看模型在哪儿犹豫的 */
  warnings: RecognitionWarning[];
}
