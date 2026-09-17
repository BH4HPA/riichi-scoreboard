import { useEffect, useState, type CSSProperties } from "react";
import { fitBox } from "./band";

/** 首帧回调迟迟不来时的兜底显示时间 */
const REVEAL_FALLBACK_MS = 500;

/**
 * 视频铺满取景区域（cover），尺寸算成像素，并且**首帧真正画出来之后才显示**。
 * iOS WebKit 的坑：视频层在首帧之前按错误尺寸建好后，只有元素再次布局才会按新尺寸重画。
 * 早先是底栏下载进度消失碰巧触发了重排（所以「半秒后铺开」）；尺寸如果在首帧之前就算好、之后再无布局变化，
 * 就会一直缩在中间。首帧回调里把它从隐藏切到显示，这次切换本身就是那次重排。
 * 注意：这是按真机症状推断的 WebKit 行为，Chromium 的 e2e 复现不了，以真机为准。
 * 裁剪换算用的是同一个 fitBox，画面与识别区域严格一致。未就绪时返回 null（调用方隐藏视频）。
 */
export function useCoverVideo(
  container: HTMLElement | null,
  videoRef: React.RefObject<HTMLVideoElement | null>,
): CSSProperties | null {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [painted, setPainted] = useState(false);

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
    let frame = 0;
    let raf = 0;
    let timer = 0;
    const cancel = () => {
      if (frame && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(frame);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      frame = raf = timer = 0;
    };
    // 先藏，等下一帧真正画出来再显示（显示这一下就是 WebKit 需要的那次重排）。
    // 兜底定时器：万一透明视频在某些 WebKit 上不回调首帧，也不能一直黑屏
    const reveal = () => {
      cancel();
      setNatural({ width: video.videoWidth, height: video.videoHeight });
      setPainted(false);
      const done = () => {
        cancel();
        setPainted(true);
      };
      if ("requestVideoFrameCallback" in video) frame = video.requestVideoFrameCallback(done);
      else raf = requestAnimationFrame(() => (raf = requestAnimationFrame(done)));
      timer = window.setTimeout(done, REVEAL_FALLBACK_MS);
    };
    // 开播前的 resize（元数据刚到）只记尺寸：还没有画面，不能提前显示
    const onResize = () => {
      if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setNatural({ width: video.videoWidth, height: video.videoHeight });
      } else {
        reveal();
      }
    };
    const onEmptied = () => {
      cancel();
      setPainted(false);
    };
    // playing：每次开流（首次、暂停后继续、看完「怎么摆」）；resize：原始尺寸变了（换镜头、旋转），重走一遍
    video.addEventListener("playing", reveal);
    video.addEventListener("resize", onResize);
    video.addEventListener("emptied", onEmptied);
    return () => {
      video.removeEventListener("playing", reveal);
      video.removeEventListener("resize", onResize);
      video.removeEventListener("emptied", onEmptied);
      cancel();
    };
  }, [videoRef]);

  const box = fitBox({
    videoWidth: natural.width,
    videoHeight: natural.height,
    displayWidth: area.width,
    displayHeight: area.height,
  });
  if (!box || !painted) return null;
  return {
    position: "absolute",
    left: box.left,
    top: box.top,
    width: natural.width * box.scale,
    height: natural.height * box.scale,
    maxWidth: "none",
  };
}
