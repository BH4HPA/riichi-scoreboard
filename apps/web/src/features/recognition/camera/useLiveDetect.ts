import { useEffect, useRef, useState } from "react";
import type { Detector } from "../worker/client";
import type { FrameResult } from "../worker/protocol";
import { bandRect, type Rect, type Viewport } from "./band";

/** 上一帧的结果保留这么久再算过期：逐帧重画框会闪 */
export const HOLD_MS = 500;

interface Options {
  detector: Detector | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  band: number;
  active: boolean;
  onFrame: (r: FrameResult) => void;
  /** 这一帧实际送去推理的区域（检测框的坐标系），标注模式据此把框画回屏幕 */
  onCrop?: (rect: Rect) => void;
}

/**
 * 实时循环：`requestVideoFrameCallback` 每来一帧就按取景带裁一块位图转移给 Worker。
 * **背压不排队**——上一帧还在推理就直接跳过这一帧，否则 300 ms 的推理会堆出越来越大的延迟，
 * 用户看到的框会慢慢落后于画面。
 */
export function useLiveDetect({ detector, videoRef, band, active, onFrame, onCrop }: Options): {
  /** 已经送出去推理的帧数，用来判断「相机开了但一直没认出东西」 */
  frames: number;
} {
  const [frames, setFrames] = useState(0);
  const bandRef = useRef(band);
  const onFrameRef = useRef(onFrame);
  const onCropRef = useRef(onCrop);
  // 走 ref：拖动取景带、换回调都不该重启整个循环（重启会丢掉正在推理的那一帧）
  useEffect(() => {
    bandRef.current = band;
    onFrameRef.current = onFrame;
    onCropRef.current = onCrop;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!detector || !video || !active) return;
    let stopped = false;
    let inFlight = false;
    let handle = 0;

    const off = detector.onResult((r) => {
      inFlight = false;
      if (!stopped) onFrameRef.current(r);
    });

    const step = () => {
      if (stopped) return;
      schedule();
      if (inFlight) return;
      const view: Viewport = {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        displayWidth: video.clientWidth,
        displayHeight: video.clientHeight,
      };
      const rect = bandRect(view, bandRef.current);
      if (!rect) return;
      inFlight = true;
      onCropRef.current?.(rect);
      void createImageBitmap(video, rect.x, rect.y, rect.width, rect.height)
        .then((bitmap) => {
          if (stopped) return bitmap.close();
          detector.infer(bitmap);
          setFrames((n) => n + 1);
        })
        .catch(() => {
          inFlight = false;
        });
    };

    // rVFC（iOS 15.4+ 起可用）比 rAF 准：视频没出新帧时不会白跑一轮裁剪
    const schedule = () => {
      if (stopped) return;
      handle =
        "requestVideoFrameCallback" in video
          ? video.requestVideoFrameCallback(() => step())
          : requestAnimationFrame(() => step());
    };
    schedule();

    return () => {
      stopped = true;
      off();
      if ("cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [detector, videoRef, active]);

  return { frames };
}
