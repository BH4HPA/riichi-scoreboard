import {
  clampBox,
  fullFrame,
  layoutHand,
  nextTrack,
  SETTLE_GAIN,
  zoomGain,
  type Box,
  type Detection,
  type FrameSize,
  type LayoutResult,
  type TrackState,
} from "@riichi/core";

/** 识别整帧里的一块，返回**整帧坐标**的检测框 */
export type Detect = (crop: Box) => Promise<Detection[]>;

export interface FrameOutcome {
  detections: Detection[];
  layout: LayoutResult;
  crop: Box;
  settled: boolean;
  passes: number;
  track: TrackState;
}

/**
 * 自动范围的一帧：先识别上一帧锁定的那一块（没有就整帧），找到手牌后如果收紧到它周围还能明显放大，
 * 当场再识别一遍——整帧缩进 640 以后牌只有二十来个像素宽，位置认得准、花色认不准，定格只能用第二遍的。
 * 每帧最多两遍；锁定以后稳态是一遍。推理本身注入进来，所以这段编排可以单测。
 */
export async function runFrame(
  detect: Detect,
  frame: FrameSize,
  track: TrackState,
  upright: boolean,
): Promise<FrameOutcome> {
  const locate = async (crop: Box) => {
    const detections = await detect(crop);
    return { detections, layout: layoutHand(detections, { upright }), crop };
  };
  const target = (l: LayoutResult) => l.window && clampBox(l.window, frame);

  let pass = await locate(track.roi ?? fullFrame(frame));
  let passes = 1;
  const tighter = target(pass.layout);
  if (tighter && zoomGain(pass.crop, tighter) >= SETTLE_GAIN) {
    pass = await locate(tighter);
    passes = 2;
  }
  const final = target(pass.layout);
  return {
    ...pass,
    passes,
    settled: final !== null && zoomGain(pass.crop, final) < SETTLE_GAIN,
    track: nextTrack({ ...track, roi: passes === 2 ? pass.crop : track.roi }, frame, pass.layout),
  };
}
