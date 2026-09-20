import { layoutHand, type Box, type LayoutOptions, type LayoutResult } from "./layout";
import type { Detection, RecognizedHand } from "./types";

/**
 * 自动范围的几何：取景页把整帧交给识别线程，线程先在整帧上找到手牌，再只识别手牌周围那一块（ROI）。
 * 这里全是纯函数——线程里的推理是异步的、没法单测，能单测的都放在这边。
 * 坐标一律是**正立帧**的像素，矩形用 `Box`（x1, y1, x2, y2）。
 */

export interface FrameSize {
  width: number;
  height: number;
}

/** 把 crop 收紧到 ROI 能放大不到这个倍数，就认为分辨率已经榨干（按长边算，与 letterbox 的缩放一致） */
export const SETTLE_GAIN = 1.2;
/** 连续这么多帧认不出一手自洽的牌，就放弃 ROI 回到整帧：ROI 可能锁在了错的一行上，或者副露在 ROI 外面 */
export const LOST_FRAMES = 2;
/** ROI 各边的移动不到长边的这个比例就沿用上一帧的：镜头轻微晃动时裁剪区域不跟着抖 */
export const ROI_STEADY = 0.08;
/** 定格照片在被采信的牌外面留的边，单位是牌的长边：要小于相邻一行的中心距（约 0.9），否则牌河的框会跟进照片 */
export const CAPTURE_PAD = 0.35;

export const fullFrame = (frame: FrameSize): Box => [0, 0, frame.width, frame.height];

/** 取整到像素并夹进帧内；夹完不成形返回 null */
export function clampBox(box: Box, frame: FrameSize): Box | null {
  const x1 = Math.max(0, Math.floor(box[0]));
  const y1 = Math.max(0, Math.floor(box[1]));
  const x2 = Math.min(frame.width, Math.ceil(box[2]));
  const y2 = Math.min(frame.height, Math.ceil(box[3]));
  return x2 - x1 >= 1 && y2 - y1 >= 1 ? [x1, y1, x2, y2] : null;
}

const longEdge = (b: Box) => Math.max(b[2] - b[0], b[3] - b[1]);

/** 从 crop 收紧到 roi，牌在模型输入里能放大多少倍 */
export function zoomGain(crop: Box, roi: Box): number {
  return longEdge(crop) / Math.max(1, longEdge(roi));
}

export interface TrackState {
  /** 下一帧先识别哪一块；null = 整帧 */
  roi: Box | null;
  /** 已经连续几帧认不出自洽的手牌 */
  misses: number;
}

export const LOST: TrackState = { roi: null, misses: 0 };

/**
 * 跟踪：这一帧认出了自洽的手牌就把 ROI 挪到它的窗口上（挪得不多则不动）；
 * 认不出来先留着 ROI 再试一帧——单帧漏检很常见，立刻回整帧要多花一次推理——连续 LOST_FRAMES 帧才放弃。
 */
export function nextTrack(
  state: TrackState,
  frame: FrameSize,
  result: Pick<LayoutResult, "window" | "warnings">,
): TrackState {
  const target = result.window && clampBox(result.window, frame);
  const ok = target !== null && !result.warnings.some((w) => w.severity === "blocking");
  if (!ok) {
    const misses = state.misses + 1;
    return misses >= LOST_FRAMES ? LOST : { roi: state.roi, misses };
  }
  const prev = state.roi;
  const steady =
    prev !== null && target.every((v, i) => Math.abs(v - prev[i]!) <= ROI_STEADY * longEdge(prev));
  return { roi: steady ? prev : target, misses: 0 };
}

const handKey = (h: RecognizedHand) => JSON.stringify(h);

export interface TightCapture {
  /** 正立帧里要存成照片的那一块 */
  box: Box;
  /** 块内的检测框，已平移到块坐标（= 照片像素坐标） */
  detections: Detection[];
  layout: LayoutResult;
}

/**
 * 定格照片收紧到被采信的牌：牌河不进照片，回流时才不会因为「有框没被采信」整条送人工，
 * 照片里也不会留着一堆没人标注的牌（YOLO 会把它们学成背景）。
 * 收紧后在块内的框上**重跑布局**——回流导出时做的正是这件事——手牌必须与收紧前逐位相同，
 * 否则返回 null，调用方退回不收紧的那一块。
 */
export function tightenCapture(
  detections: readonly Detection[],
  layout: LayoutResult,
  frame: FrameSize,
  options: Partial<LayoutOptions> = {},
): TightCapture | null {
  const used = layout.provenance.usedDetections.map((i) => detections[i]!);
  if (used.length === 0) return null;
  const sizes = used.map((d) => Math.max(d.box[2] - d.box[0], d.box[3] - d.box[1]));
  const pad = CAPTURE_PAD * [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)]!;
  const box = clampBox(
    [
      Math.min(...used.map((d) => d.box[0])) - pad,
      Math.min(...used.map((d) => d.box[1])) - pad,
      Math.max(...used.map((d) => d.box[2])) + pad,
      Math.max(...used.map((d) => d.box[3])) + pad,
    ],
    frame,
  );
  if (!box) return null;
  const moved = translateInto(detections, box);
  const again = layoutHand(moved, options);
  if (handKey(again.hand) !== handKey(layout.hand)) return null;
  return { box, detections: moved, layout: again };
}

/** 只留中心在块内的框，平移到块坐标并夹进块内 */
export function translateInto(detections: readonly Detection[], box: Box): Detection[] {
  const [x1, y1, x2, y2] = box;
  const [w, h] = [x2 - x1, y2 - y1];
  const out: Detection[] = [];
  for (const d of detections) {
    const cx = (d.box[0] + d.box[2]) / 2;
    const cy = (d.box[1] + d.box[3]) / 2;
    if (cx < x1 || cx > x2 || cy < y1 || cy > y2) continue;
    out.push({
      ...d,
      box: [
        Math.max(0, d.box[0] - x1),
        Math.max(0, d.box[1] - y1),
        Math.min(w, d.box[2] - x1),
        Math.min(h, d.box[3] - y1),
      ],
    });
  }
  return out;
}
