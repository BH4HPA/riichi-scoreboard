import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Images, X } from "lucide-react";
import {
  RECOGNITION_CLASSES,
  RECOGNITION_MANIFEST,
  type Detection,
  type RecognitionResult,
  type RoomRules,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { HandView } from "@/features/hand/HandView";
import { canUseCamera } from "@/lib/device";
import { closeDetector, openDetector, type Detector } from "../worker/client";
import type { FrameResult } from "../worker/protocol";
import { BAND_DEFAULT, type Rect } from "./band";
import { BandOverlay } from "./BandOverlay";
import { DetectionOverlay } from "./DetectionOverlay";
import { StillPicker } from "./StillPicker";
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
  mode = "room",
  onCapture,
  onClose,
}: {
  rules: RoomRules;
  /** label：多画检测框与牌图标签，多给一个相册入口（标注模式才有） */
  mode?: "room" | "label";
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

  const [file, setFile] = useState<File | null>(null);
  /** 相册那张正在推理：实时循环让开，免得两边抢 Worker 互相把对方的帧挤掉 */
  const [stillBusy, setStillBusy] = useState(false);
  /** 定格的视觉回执：iOS 全系没有 navigator.vibrate，只靠震动等于没有反馈 */
  const [flash, setFlash] = useState(false);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [picked, setPicked] = useState<Detection | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const captureRef = useRef(EMPTY_CAPTURE);
  const stillRef = useRef(0);
  const grabbingRef = useRef(false);
  const lastGoodRef = useRef(openedAt);
  const framesRef = useRef(new Map<number, FrameResult>());

  const active = !paused && file === null && !stillBusy;
  const lost = useCallback(() => setPaused(true), []);
  const { videoRef, error: camError, ready } = useCameraStream(active, lost);

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

  // ready 之后才崩的会话（iOS 上的 ORT、推理抛错）：没有这条通道界面会一直显示正常
  useEffect(() => {
    if (!detector) return;
    return detector.onError((message) => {
      setError(message);
      setDetector(null);
    });
  }, [detector]);

  // 切后台立即停流（回前台由用户点一下继续，免得 iOS 悄悄恢复时用户已经放下手机）
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && setPaused(true);
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  // Esc 归取景框自己：不拦的话 radix 会顺手把背后的结算对话框一起关掉，草稿全丢
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
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

      // 相册那张是一次性的：结果一到就直接定格，不参与连续三帧的稳定判断
      if (r.frameId === stillRef.current) {
        stillRef.current = 0;
        setStillBusy(false);
        setFlash(true);
        void capture();
        return;
      }

      const out = feedFrame(captureRef.current, r);
      captureRef.current = out.state;
      setStable(out.state.count);
      if (out.state.count > 0) lastGoodRef.current = Date.now();
      if (out.fire) {
        navigator.vibrate?.(30);
        setFlash(true);
        void capture();
      }
    },
    [capture],
  );

  const runStill = useCallback(
    async (src: ImageBitmap, rect: Rect) => {
      if (!detector) return setFile(null);
      // 先停实时循环再送帧：否则这一张有极大概率撞上正在推理的实时帧被背压丢掉，
      // 用户点了「用这块识别」却什么也不发生
      setStillBusy(true);
      setFile(null);
      const cropped = await createImageBitmap(src, rect.x, rect.y, rect.width, rect.height);
      stillRef.current = detector.infer(cropped);
    },
    [detector],
  );

  useLiveDetect({
    detector,
    videoRef,
    band,
    active: active && ready,
    onFrame,
    ...(mode === "label" ? { onCrop: setCropRect } : {}),
  });

  const secure = canUseCamera();
  const downloading = !detector && !error && progress < 1;
  const overdue = now - openedAt > HINT_AFTER_MS && !paused;
  const hint =
    live && stable > 0
      ? `认出 ${live.hand.closed.length} 张 · 稳定 ${stable}/${STABLE_FRAMES}`
      : "把手牌、副露和宝牌指示牌放进框里";

  // portal 到 body：DialogContent 在 ≥640px 上有 translate，transform 祖先会让 fixed 以它为
  // 包含块，取景框就被压进对话框里不再全屏；顺带让背后的内容退出无障碍树。
  return createPortal(
    <div
      // pointer-events-auto 不能省：radix 的 Dialog 打开时会给 body 挂 pointer-events:none，
      // 只在它自己的 content 里放开；portal 出来的我们是 body 的另一个孩子，不声明就点不动。
      className="pointer-events-auto fixed inset-0 z-[75] flex touch-none flex-col overscroll-contain bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="拍照识别取景"
      data-testid="camera-sheet"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          data-testid="camera-video"
        />
        {!paused && <BandOverlay band={band} onBandChange={setBand} hint={hint} />}
        {mode === "label" && live && !paused && (
          <div
            className="absolute inset-x-0"
            style={{ top: `${((1 - band) / 2) * 100}%`, height: `${band * 100}%` }}
          >
            {cropRect && (
              <DetectionOverlay detections={live.detections} crop={cropRect} onPick={setPicked} />
            )}
          </div>
        )}
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
        {flash && (
          <span
            className="pointer-events-none absolute inset-0 bg-white/70"
            onAnimationEnd={() => setFlash(false)}
            style={{ animation: "riichi-flash 220ms ease-out forwards" }}
            aria-hidden
          />
        )}
        {picked && (
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="absolute inset-x-3 top-3 rounded-lg bg-black/70 px-3 py-2 text-sm text-white"
          >
            {RECOGNITION_CLASSES[picked.cls] ?? "?"} · 置信度 {Math.round(picked.conf * 100)}%
          </button>
        )}
      </div>

      <div className="space-y-2 bg-black/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-white">
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
          <div className="flex items-center gap-2">
            {/* 相册只在标注模式给：房间里就地拍一张的成本已经接近零 */}
            {mode === "label" && (
              <label
                className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-white/40 px-2.5 text-sm"
                aria-label="从相册选一张"
              >
                <Images className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="label-album"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (f) setFile(f);
                  }}
                />
              </label>
            )}
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

      {file && (
        <StillPicker
          file={file}
          onPick={(bitmap, rect) => void runStill(bitmap, rect)}
          onCancel={() => setFile(null)}
        />
      )}
    </div>,
    document.body,
  );
}
