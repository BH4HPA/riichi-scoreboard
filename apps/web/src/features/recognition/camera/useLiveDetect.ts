import { useEffect, useRef } from "react";
import type { Detector } from "../worker/client";
import type { FrameResult } from "../worker/protocol";
import type { Rotation } from "./orientation/upright";

interface Options {
  detector: Detector | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 界面转了多少度：帧按它转正后再识别 */
  rotation: Rotation;
  active: boolean;
  onFrame: (r: FrameResult) => void;
}

/**
 * 实时循环：`requestVideoFrameCallback` 每来一帧就把**整帧**转移给 Worker，识别哪一块由 Worker 自己定。
 * **背压不排队**——上一帧还在推理就直接跳过这一帧，否则 300 ms 的推理会堆出越来越大的延迟，
 * 用户看到的框会慢慢落后于画面。
 */
export function useLiveDetect({ detector, videoRef, rotation, active, onFrame }: Options): void {
  const onFrameRef = useRef(onFrame);
  const rotationRef = useRef(rotation);
  // 走 ref：换回调、转方向都不该重启整个循环（重启会丢掉正在推理的那一帧）
  useEffect(() => {
    onFrameRef.current = onFrame;
    rotationRef.current = rotation;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!detector || !video || !active) return;
    let stopped = false;
    let inFlight = false;
    let handle = 0;

    // r === null 表示这一帧被 Worker 背压丢掉了：闸门照样要放开，否则循环永久停摆
    const off = detector.onResult((r) => {
      inFlight = false;
      if (r && !stopped) onFrameRef.current(r);
    });

    const step = () => {
      if (stopped) return;
      schedule();
      if (inFlight || video.videoWidth === 0 || video.videoHeight === 0) return;
      inFlight = true;
      void createImageBitmap(video)
        .then((bitmap) => {
          if (stopped) return bitmap.close();
          detector.infer(bitmap, rotationRef.current);
        })
        .catch(() => {
          inFlight = false;
        });
    };

    // rVFC（iOS 15.4+ 起可用）比 rAF 准：视频没出新帧时不会白跑一轮
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
}
