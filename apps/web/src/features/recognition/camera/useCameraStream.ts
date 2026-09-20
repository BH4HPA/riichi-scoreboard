import { useEffect, useRef, useState } from "react";
import { canUseCamera } from "@/lib/device";

/** 请求的分辨率：裁出手牌那一块还要 letterbox 到 640，源越清楚每张牌剩的像素越多 */
const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
};

function reason(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "相机权限被拒绝，请在浏览器设置里允许后重试";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "没有找到可用的后置相机";
  if (name === "NotReadableError") return "相机被别的应用占用了";
  return err instanceof Error ? err.message : "无法打开相机";
}

/**
 * 打开后置相机并接到 `<video>` 上。`playsInline` + `muted` 是 iOS Safari 的硬要求，
 * 否则会被强制全屏播放（`QrScan` 同样的写法）。
 * `active=false` 时停流：熄屏、切后台、60 秒没认出牌面都走这条路，省电防烫。
 */
export function useCameraStream(
  active: boolean,
  /** 相机被别的应用抢走 / 权限中途撤销：画面会冻住，必须停下来，否则会对着死画面误定格 */
  onLost?: () => void,
): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
  ready: boolean;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const onLostRef = useRef(onLost);
  useEffect(() => {
    onLostRef.current = onLost;
  });

  // 非安全上下文或浏览器没有相机 API：navigator.mediaDevices 可能根本不存在，不能去调
  const supported = canUseCamera();

  useEffect(() => {
    if (!active || !supported) return;
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia(CONSTRAINTS)
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (!video) {
          setError("页面还没准备好，请重试");
          return;
        }
        s.getVideoTracks().forEach((t) => t.addEventListener("ended", () => onLostRef.current?.()));
        video.srcObject = s;
        try {
          await video.play();
        } catch (err) {
          // 播不起来就不会有帧，rVFC 永远不回调：必须报出来，否则用户只看到不动的黑屏
          if (!cancelled) setError(reason(err));
          return;
        }
        if (cancelled) return;
        setError(null);
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(reason(err));
      });
    return () => {
      cancelled = true;
      setReady(false);
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [active, supported]);

  return {
    videoRef,
    error: supported ? error : "当前环境无法使用相机（需要 HTTPS），可以从相册选一张",
    ready,
  };
}
