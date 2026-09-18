import type { Tile } from "../types/tiles";
import { AKA } from "../types/tiles";
import manifestJson from "./manifest.json";

/**
 * 拍照识别模型的类目录与当前发布的模型。
 * - `classes` 的下标 = 检测模型的类 id，是训练侧（ml/configs/tiles.yaml 由它生成）与推理侧共同的唯一真源；
 *   顺序固定为 1–9m 0m 1–9p 0p 1–9s 0s 1–7z back（0 = 赤五，z 依次 东南西北白发中，back = 牌背）。
 * - `model` 是当前发布的模型：对象放在 static 桶 `riichi/models/<id>.onnx`（ci/upload-model.sh 上传并写回），
 *   为 null 表示尚未发布，网页据此隐藏识别入口。
 */
export interface RecognitionModel {
  /** 桶内对象名（小写 uuid v4） */
  id: string;
  /** onnx 文件的 sha256：发布脚本写入，供人工核对桶内对象与回流对账；运行时不校验 */
  sha256: string;
  /** 训练/导出时的输入边长（letterbox 正方形） */
  imgsz: number;
  /** 上传发布日期 YYYY-MM-DD */
  publishedAt: string;
  note: string;
}

export interface RecognitionManifest {
  classes: readonly string[];
  model: RecognitionModel | null;
}

export const RECOGNITION_MANIFEST: RecognitionManifest = manifestJson;

export const RECOGNITION_CLASSES: readonly string[] = RECOGNITION_MANIFEST.classes;

export const BACK_CLASS = "back";

/** 类名 → 牌码；牌背返回 null；未知类名抛错（manifest 与调用方不一致属编程错误）。 */
export function tileOfClass(name: string): Tile | null {
  if (name === BACK_CLASS) return null;
  const m = /^([0-9])([mpsz])$/.exec(name);
  if (!m) throw new Error(`unknown recognition class: ${name}`);
  const n = Number(m[1]);
  const suit = m[2];
  if (n === 0) {
    if (suit === "m") return AKA.M5;
    if (suit === "p") return AKA.P5;
    if (suit === "s") return AKA.S5;
    throw new Error(`unknown recognition class: ${name}`);
  }
  if (suit === "m") return n;
  if (suit === "p") return 9 + n;
  if (suit === "s") return 18 + n;
  if (n > 7) throw new Error(`unknown recognition class: ${name}`);
  return 27 + n;
}

/** 类 id（模型输出）→ 牌码；越界抛错。 */
export function tileOfClassId(cls: number): Tile | null {
  const name = RECOGNITION_CLASSES[cls];
  if (name === undefined) throw new Error(`recognition class id out of range: ${cls}`);
  return tileOfClass(name);
}
