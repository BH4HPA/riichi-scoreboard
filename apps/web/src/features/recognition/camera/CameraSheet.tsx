import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { RECOGNITION_MANIFEST, type RecognitionResult, type RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { HandView } from "@/features/hand/HandView";
import { canUseCamera } from "@/lib/device";
import { closeDetector, openDetector, type Detector } from "../worker/client";
import type { FrameResult } from "../worker/protocol";
import { BAND_DEFAULT } from "./band";
import { BandOverlay } from "./BandOverlay";
import { EMPTY_CAPTURE, feedFrame, HINT_AFTER_MS, STABLE_FRAMES } from "./autoCapture";
import { useCameraStream } from "./useCameraStream";
import { useLiveDetect } from "./useLiveDetect";

/** 一直没认出有效牌面就停流，省电防烫（用户拍板 60 秒） */
const IDLE_STOP_MS = 60_000;
/** grab 回来的 frameId 要能配上同一帧的识别结果，留最近几帧就够 */
const FRAME_MEMORY = 4;

export interface Capture {
  blob: Blob;
  result: RecognitionResult;
}

/**
 * 全屏取景：对准手牌，连续三帧认出同一副牌就自动定格。
 * 自绘覆盖层而不是 `Dialog`——`DialogContent` 在手机上是 92dvh 的底部抽屉，盖不满屏；
 * 层级取 75（Select 60 / Tooltip 70 / Notice 80 之间）。
 * **由调用方按需挂载 / 卸载**（不是 open 开关）：每次打开都是全新状态，不用在 effect 里重置。
 */
export function CameraSheet({
  rules,
  onCapture,
  onClose,
}: {
  rules: RoomRules;
  onCapture: (c: Capture) => void;
  onClose: () => void;
}) {
  const [detector, setDetector] = useState<Detector | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [band, setBand] = useState(BAND_DEFAULT);
  const [live, setLive] = useState<FrameResult | null>(null);
  const [stable, setStable] = useState(0);
  const [paused, setPaused] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const captureRef = useRef(EMPTY_CAPTURE);
  const grabbingRef = useRef(false);
  const lastGoodRef = useRef(openedAt);
  const framesRef = useRef(new Map<number, FrameResult>());

  const active = !paused;
  const { videoRef, error: camError, ready } = useCameraStream(active);

  // 识别线程随取景页开关：一局牌九成时间用不上，几十 MB 的会话不必常驻
  useEffect(() => {
    let cancelled = false;
    openDetector(setProgress)
      .then((d) => !cancelled && setDetector(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "识别不可用"));
    return () => {
      cancelled = true;
      closeDetector();
    };
  }, []);

  // 切后台立即停流（回前台由用户点一下继续，免得 iOS 悄悄恢复时用户已经放下手机）
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && setPaused(true);
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  // 一秒一跳，只为驱动「5 秒提示快门」与「60 秒停流」两个时间判断
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - lastGoodRef.current > IDLE_STOP_MS) setPaused(true);
    }, 1000);
    return () => clearInterval(t);
  }, [active]);

  const capture = useCallback(async () => {
    if (!detector || grabbingRef.current) return;
    grabbingRef.current = true;
    try {
      const got = await detector.grab();
      const modelId = RECOGNITION_MANIFEST.model?.id;
      if (!got || !modelId) return;
      // 只认 Worker 回报的那一帧：照片与检测框必须同源，否则回流出来的训练数据是错位的
      const frame = framesRef.current.get(got.frameId);
      if (!frame) return;
      onCapture({
        blob: got.blob,
        result: {
          modelId,
          ms: frame.ms,
          detections: frame.detections,
          hand: frame.hand,
          warnings: frame.warnings,
          provenance: frame.provenance,
        },
      });
    } finally {
      grabbingRef.current = false;
    }
  }, [detector, onCapture]);

  const onFrame = useCallback(
    (r: FrameResult) => {
      setLive(r);
      const map = framesRef.current;
      map.set(r.frameId, r);
      for (const id of map.keys()) if (id < r.frameId - FRAME_MEMORY) map.delete(id);

      const out = feedFrame(captureRef.current, r);
      captureRef.current = out.state;
      setStable(out.state.count);
      if (out.state.count > 0) lastGoodRef.current = Date.now();
      if (out.fire) {
        navigator.vibrate?.(30);
        void capture();
      }
    },
    [capture],
  );

  useLiveDetect({ detector, videoRef, band, active: active && ready, onFrame });

  const secure = canUseCamera();
  const downloading = !detector && !error && progress < 1;
  const overdue = now - openedAt > HINT_AFTER_MS && !paused;
  const hint =
    live && stable > 0
      ? `认出 ${live.hand.closed.length} 张 · 稳定 ${stable}/${STABLE_FRAMES}`
      : "把手牌、副露和宝牌指示牌放进框里";

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-black" data-testid="camera-sheet">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          data-testid="camera-video"
        />
        {!paused && <BandOverlay band={band} onBandChange={setBand} hint={hint} />}
        {paused && (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/70 text-white"
            onClick={() => {
              lastGoodRef.current = Date.now();
              setPaused(false);
            }}
          >
            已暂停，点击继续
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭取景"
          className="absolute left-3 top-3 rounded-full bg-black/50 p-2 text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-2 bg-black/90 px-4 py-3 text-white">
        {!secure && (
          <p className="text-sm text-neg">当前不是安全上下文（需要 HTTPS），相机无法打开。</p>
        )}
        {(error ?? camError) && <p className="text-sm text-neg">{error ?? camError}</p>}
        {downloading && (
          <div>
            <p className="text-xs">
              模型下载中 {Math.round(progress * 100)}%（约 25 MB，只下一次）
            </p>
            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-white/20">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}
        {live && (
          <div className="overflow-x-auto">
            <HandView hand={live.hand} size="xs" showUra={rules.hand.uraDora} className="w-max" />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-white/70">
            {overdue ? "对不齐？直接按快门" : "对准后会自动定格"}
          </span>
          <Button
            variant={overdue ? "accent" : "outline"}
            size="sm"
            onClick={() => void capture()}
            disabled={!detector}
            data-testid="camera-shutter"
          >
            快门
          </Button>
        </div>
      </div>
    </div>
  );
}
