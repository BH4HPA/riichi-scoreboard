import { DomainError } from "../types/errors";
import { validateHandShape } from "../reducer/validateCommand";
import type { HandInput } from "../types/state";
import { MAX_TILE } from "../types/tiles";
import { RECOGNITION_CLASSES } from "./classes";
import type { Detection, RecognitionPatch, RecognizedHand } from "./types";

export const MAX_DETECTIONS = 300;

function bad(message: string): never {
  throw new DomainError("bad_recognition", message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) bad(`${what}无效`);
  return v;
}

function tiles(v: unknown, what: string, max: number, min = 1): number[] {
  if (!Array.isArray(v) || v.length > max) bad(`${what}无效`);
  return v.map((t) => {
    if (typeof t !== "number" || !Number.isInteger(t) || t < min || t > MAX_TILE)
      bad(`${what}无效`);
    return t;
  });
}

function detection(v: unknown): Detection {
  if (!isRecord(v)) bad("检测框无效");
  const cls = finite(v.cls, "检测类");
  if (!Number.isInteger(cls) || cls < 0 || cls >= RECOGNITION_CLASSES.length) bad("检测类无效");
  const conf = finite(v.conf, "置信度");
  if (conf < 0 || conf > 1) bad("置信度无效");
  if (!Array.isArray(v.box) || v.box.length !== 4) bad("检测框无效");
  const box = v.box.map((n) => finite(n, "检测框")) as [number, number, number, number];
  if (box[2] <= box[0] || box[3] <= box[1]) bad("检测框无效");
  return { cls, conf, box };
}

function recognized(v: unknown): RecognizedHand {
  if (!isRecord(v)) bad("识别结果无效");
  if (!Array.isArray(v.melds) || v.melds.length > 4) bad("识别的副露无效");
  return {
    closed: tiles(v.closed, "识别的暗牌", 14),
    melds: v.melds.map((m) => {
      if (!isRecord(m) || typeof m.open !== "boolean") bad("识别的副露无效");
      return { open: m.open, tiles: tiles(m.tiles, "识别的副露", 4) };
    }),
    winTile: tiles([v.winTile], "识别的和张", 1, 0)[0]!,
    doraIndicators: tiles(v.doraIndicators, "识别的宝牌指示牌", 5),
    uraIndicators: tiles(v.uraIndicators, "识别的里宝指示牌", 5),
  };
}

function corrected(v: unknown): HandInput {
  try {
    return validateHandShape(v);
  } catch (err) {
    bad(err instanceof DomainError ? err.message : "手牌无效");
  }
}

/** PATCH /api/recognitions/:id 的请求体：只校验给出的字段。 */
export function validateRecognitionPatch(v: unknown): RecognitionPatch {
  if (!isRecord(v)) bad("请求体无效");
  const patch: RecognitionPatch = {};
  if (v.modelId !== undefined) {
    if (typeof v.modelId !== "string" || !/^[0-9a-f-]{36}$/.test(v.modelId)) bad("模型 id 无效");
    patch.modelId = v.modelId;
  }
  if (v.ms !== undefined) {
    const ms = finite(v.ms, "耗时");
    if (ms < 0 || !Number.isInteger(ms)) bad("耗时无效");
    patch.ms = ms;
  }
  if (v.detections !== undefined) {
    if (!Array.isArray(v.detections) || v.detections.length > MAX_DETECTIONS) bad("检测框过多");
    patch.detections = v.detections.map(detection);
  }
  if (v.recognized !== undefined) patch.recognized = recognized(v.recognized);
  if (v.corrected !== undefined) patch.corrected = corrected(v.corrected);
  if (Object.keys(patch).length === 0) bad("没有可更新的字段");
  return patch;
}
