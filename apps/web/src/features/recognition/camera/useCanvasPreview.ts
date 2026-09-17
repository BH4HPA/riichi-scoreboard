import { useEffect, useState } from "react";
import { fitBox } from "./band";

/** 预览画布的像素密度上限：再高肉眼看不出，白白多画 */
const MAX_DPR = 2;

/**
 * 取景预览画在 canvas 上，canvas 不透明地盖在 `<video>` 上面。
 * iOS WebKit 的视频图层在开流后一段时间内按错误尺寸绘制（开流时摄像头先报横向尺寸，首帧后才变竖向；
 * 真机读数：元素已按 cover 铺满、画面却缩成一条竖条），Apple 论坛上 15.4–17 一直有人报且无官方修复，
 * 社区通用绕法之一就是不依赖浏览器绘制视频、用 JS 自己画。视频本身照常可见（只是被盖住），
 * 识别循环依赖的逐帧回调不受影响。
 *
 * 优先 requestVideoFrameCallback：每个新帧回调一次，用这一帧自带的宽高作画（尺寸与内容严格对应），
 * 停流时自然不再回调；不支持时退回 rAF。停流（emptied）清空画布并复位——新流画出第一帧前不算「在出画面」。
 * 画法与裁剪共用 fitBox（cover），画面与识别区域严格一致。返回是否已经画出了当前这路流的画面。
 */
export function useCanvasPreview(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvas: HTMLCanvasElement | null,
): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx) return;
    let stopped = false;
    let frame = 0;
    let raf = 0;

    const paint = (frameWidth: number, frameHeight: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const box = fitBox({
        videoWidth: frameWidth,
        videoHeight: frameHeight,
        displayWidth: width,
        displayHeight: height,
      });
      if (!box) return;
      ctx.drawImage(video, box.left, box.top, frameWidth * box.scale, frameHeight * box.scale);
      setPainted(true);
    };

    // 不用 `in` 判断：TS 会把 else 分支里的 video 收窄成 never
    const useRvfc =
      typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback ===
      "function";
    const schedule = () => {
      if (stopped) return;
      if (useRvfc) {
        frame = video.requestVideoFrameCallback((_now, meta) => {
          paint(meta.width, meta.height);
          schedule();
        });
      } else {
        raf = requestAnimationFrame(() => {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            paint(video.videoWidth, video.videoHeight);
          }
          schedule();
        });
      }
    };
    const onEmptied = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setPainted(false);
    };

    schedule();
    video.addEventListener("emptied", onEmptied);
    return () => {
      stopped = true;
      video.removeEventListener("emptied", onEmptied);
      if (useRvfc) video.cancelVideoFrameCallback(frame);
      cancelAnimationFrame(raf);
    };
  }, [videoRef, canvas]);

  return painted;
}
