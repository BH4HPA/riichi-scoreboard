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
import { closeDetector, openDetector, type Detector } from "../worker/client";
import type { FrameResult } from "../worker/protocol";
import { BAND_DEFAULT, fitLongEdge, STILL_MAX_EDGE, type Rect } from "./band";
import { BandOverlay } from "./BandOverlay";
import { DetectionOverlay } from "./DetectionOverlay";
import { StillPicker } from "./StillPicker";
import { EMPTY_CAPTURE, feedFrame, STABLE_FRAMES } from "./autoCapture";
import { LayoutGuide } from "./LayoutGuide";
import { useCameraStream } from "./useCameraStream";
import { useCanvasPreview } from "./useCanvasPreview";
import { useElementHeight } from "./useElementHeight";
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
  /** calc（拍照算点数页）：多画检测框与牌图标签，多给一个相册入口 */
  mode?: "room" | "calc";
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

  const [file, setFile] = useState<File | null>(null);
  /** 相册那张正在推理：实时循环让开，免得两边抢 Worker 互相把对方的帧挤掉 */
  const [stillBusy, setStillBusy] = useState(false);
  /** 定格的视觉回执：iOS 全系没有 navigator.vibrate，只靠震动等于没有反馈 */
  const [flash, setFlash] = useState(false);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [picked, setPicked] = useState<Detection | null>(null);
  const [guide, setGuide] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const captureRef = useRef(EMPTY_CAPTURE);
  const stillRef = useRef(0);
  /** 已经处理过的相册帧：实时监听若也收到它，不能再当实时帧计数 */
  const stillDoneRef = useRef(0);
  const grabbingRef = useRef(false);
  const lastGoodRef = useRef(openedAt);
  const framesRef = useRef(new Map<number, FrameResult>());

  // 看「怎么摆」时停流、停识别：人在读说明，不该对着桌面偷偷定格
  const active = !paused && file === null && !stillBusy && !guide;
  const lost = useCallback(() => setPaused(true), []);
  const { videoRef, error: camError, ready } = useCameraStream(active, lost);
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const panelHeight = useElementHeight(panel);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const painted = useCanvasPreview(videoRef, preview);

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

  // 一秒一跳，只为「60 秒没认出牌就停流」的判断
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
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
      if (r.frameId === stillDoneRef.current) return;
      if (r.frameId === stillRef.current) {
        stillDoneRef.current = r.frameId;
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

  // 相册那张的结果单独收：实时循环此刻是停着的（相机用不了、或正在让路给这一张），它的监听不在
  useEffect(() => {
    if (!detector) return;
    return detector.onResult((r) => {
      if (stillRef.current === 0) return;
      if (r) {
        if (r.frameId === stillRef.current) onFrame(r);
        return;
      }
      // null = 被背压丢掉了：相册那张不会再有结果，复位让用户重来
      stillRef.current = 0;
      setStillBusy(false);
      setError("这张没识别成功，请重试");
    });
  }, [detector, onFrame]);

  const runStill = useCallback(
    async (src: ImageBitmap, rect: Rect) => {
      if (!detector) return setFile(null);
      // 紧接着的 setFile(null) 会让相机与实时循环恢复；stillBusy 让它们继续停到静帧结果回来，
      // 否则这一张会撞上实时帧被背压丢掉，用户点了「用这块识别」却什么也不发生
      setStillBusy(true);
      setFile(null);
      try {
        // 相册原图动辄 4000px：裁出来的一条按实时帧的尺度缩小再送（识别尺度一致，定格照片也不至于太大）
        const size = fitLongEdge(rect.width, rect.height, STILL_MAX_EDGE);
        const canvas = new OffscreenCanvas(size.width, size.height);
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
        stillRef.current = detector.infer(canvas.transferToImageBitmap());
      } catch (err) {
        // 失败要复位：否则 stillBusy 一直为真，实时取景再也不会恢复
        stillRef.current = 0;
        setStillBusy(false);
        setError(err instanceof Error ? err.message : "这张照片处理失败");
      }
    },
    [detector],
  );

  useLiveDetect({
    detector,
    videoRef,
    area,
    band,
    bottomInset: panelHeight,
    active: active && ready,
    onFrame,
    ...(mode === "calc" ? { onCrop: setCropRect } : {}),
  });

  /** 相机用不了（权限、无设备、占用、非 HTTPS）：快门没有意义，给相册入口 */
  const camBroken = camError !== null;
  const canShoot = detector !== null && ready && painted && live !== null && !camBroken;
  const downloading = !detector && !error && progress < 1;
  /** 右上角的小字进度：认出几张（副露按 3 张折算）· 连续几帧一致 */
  const progressText = live
    ? `${Math.min(14, live.hand.closed.length + live.hand.melds.length * 3)}/14 · ${stable}/${STABLE_FRAMES}`
    : null;

  // portal 到 body：DialogContent 在 ≥640px 上有 translate，transform 祖先会让 fixed 以它为
  // 包含块，取景框就被压进对话框里不再全屏；顺带让背后的内容退出无障碍树。
  return createPortal(
    <div
      // pointer-events-auto 不能省：radix 的 Dialog 打开时会给 body 挂 pointer-events:none，
      // 只在它自己的 content 里放开；portal 出来的我们是 body 的另一个孩子，不声明就点不动。
      className="pointer-events-auto fixed inset-0 z-[75] touch-none overscroll-contain bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="拍照识别取景"
      data-testid="camera-sheet"
    >
      <div
        ref={setArea}
        // 画面铺满整屏，底栏浮在上面（沉浸）：取景带与裁剪都以整屏为准
        className="absolute inset-0 overflow-hidden"
        data-testid="camera-area"
      >
        {/* 画面由盖在上面的 canvas 逐帧绘制（纯黑底、完全遮住视频）：绕开 iOS 视频图层开流后尺寸画错的问题。
            视频本身保持可见，识别循环的逐帧回调照常工作 */}
        <video
          ref={videoRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          data-testid="camera-video"
        />
        <canvas
          ref={setPreview}
          className="absolute inset-0 h-full w-full bg-black"
          data-testid="camera-preview"
          data-painted={painted || undefined}
        />
        {/* 取景带下方的暗色遮罩一直铺到屏幕底部：底栏压在暗区上，颜色连成一片 */}
        {!paused && (
          <div
            className="absolute inset-x-0 bottom-0 bg-black/60"
            style={{ height: panelHeight }}
            aria-hidden
          />
        )}
        {/* 取景带只在底栏以上的可见部分里（画面铺满整屏，底栏浮在下面） */}
        <div className="absolute inset-x-0 top-0" style={{ bottom: panelHeight }}>
          {!paused && (
            <BandOverlay
              band={band}
              onBandChange={setBand}
              hint="把手牌、副露和宝牌指示牌放进框里"
            />
          )}
          {mode === "calc" && live && !paused && (
            <div
              className="absolute inset-x-0"
              style={{ top: `${((1 - band) / 2) * 100}%`, height: `${band * 100}%` }}
            >
              {cropRect && (
                <DetectionOverlay detections={live.detections} crop={cropRect} onPick={setPicked} />
              )}
            </div>
          )}
        </div>
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
        {progressText && !paused && (
          <span
            className="pointer-events-none absolute right-3 top-4 text-xs tabular text-white/80 drop-shadow"
            data-testid="camera-progress"
          >
            {progressText}
          </span>
        )}
        {flash && (
          <span
            className="pointer-events-none absolute inset-0 bg-white/70"
            onAnimationEnd={() => setFlash(false)}
            style={{ animation: "riichi-flash 220ms ease-out forwards" }}
            aria-hidden
          />
        )}
        {guide && (
          <LayoutGuide
            onClose={() => {
              lastGoodRef.current = Date.now();
              setGuide(false);
            }}
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

      <div
        ref={setPanel}
        data-testid="camera-panel"
        className="absolute inset-x-0 bottom-0 space-y-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-white"
      >
        {camError && <p className="text-sm text-neg">{camError}</p>}
        {error && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-neg">{error}</p>
            {mode === "room" && (
              <Button variant="outline" size="sm" className="shrink-0 text-fg" onClick={onClose}>
                返回键盘录入
              </Button>
            )}
          </div>
        )}
        {/* 固定高度（一行手牌 + 一行指示牌）：模型下载进度、认出/没认出来回切换都在这一格里，
            底栏不能伸缩，否则取景带跟着跳 */}
        <div className="h-[70px] overflow-hidden" data-testid="camera-live">
          {downloading ? (
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
          ) : (
            live && (
              <div className="overflow-x-auto px-1 py-1">
                <HandView
                  hand={live.hand}
                  size="xs"
                  showUra={rules.hand.uraDora}
                  indicatorClassName="text-white/70"
                  className="w-max"
                />
              </div>
            )
          )}
        </div>
        {/* 最后一行：左边说明，右边相册与快门。min-h-8 按按钮高度留位，快门出现/消失时底栏不伸缩 */}
        <div className="flex min-h-8 items-center justify-between gap-3 text-xs text-white/70">
          <span className="flex min-w-0 items-center gap-3">
            <span className="truncate">拍下的牌面照片会用来改进识别</span>
            <button type="button" className="shrink-0 underline" onClick={() => setGuide(true)}>
              怎么摆
            </button>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {/* 相册：算点数页常驻；房间里就地拍一张成本接近零，只在相机用不了时才给 */}
            {(mode === "calc" || camBroken) && (
              <label
                className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-lg border border-white/40 px-2.5 text-sm text-white"
                aria-label="从相册选一张"
              >
                <Images className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="camera-album"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (f) setFile(f);
                  }}
                />
              </label>
            )}
            {canShoot && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => void capture()}
                data-testid="camera-shutter"
              >
                快门
              </Button>
            )}
          </span>
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
