import { useEffect, useState, type CSSProperties } from "react";
import { fitBox } from "./band";

/**
 * 视频铺满取景区域（cover），尺寸自己算成像素而不靠 CSS 的 object-fit：
 * iOS WebKit 刚开流时不应用 object-fit，画面会缩在中间一小块、半秒后才铺开。
 * 视频尺寸未知前返回 null（调用方先隐藏视频）。裁剪换算用的是同一个 fitBox，画面与识别区域严格一致。
 */
export function useCoverVideo(
  container: HTMLElement | null,
  videoRef: React.RefObject<HTMLVideoElement | null>,
): CSSProperties | null {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(([entry]) =>
      setArea({ width: entry!.contentRect.width, height: entry!.contentRect.height }),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // resize：换摄像头、旋转屏幕时视频原始尺寸会变
    const update = () => setNatural({ width: video.videoWidth, height: video.videoHeight });
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
    };
  }, [videoRef]);

  const box = fitBox({
    videoWidth: natural.width,
    videoHeight: natural.height,
    displayWidth: area.width,
    displayHeight: area.height,
  });
  if (!box) return null;
  return {
    position: "absolute",
    left: box.left,
    top: box.top,
    width: natural.width * box.scale,
    height: natural.height * box.scale,
    maxWidth: "none",
  };
}
