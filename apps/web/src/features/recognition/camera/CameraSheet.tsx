import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Images, RotateCw, X } from "lucide-react";
import {
  RECOGNITION_CLASSES,
  type Detection,
  type RecognitionResult,
  type RoomRules,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { HandView } from "@/features/hand/HandView";
import { RECOGNITION_MODEL } from "../modelUrl";
import { closeDetector, openDetector, type Detector } from "../worker/client";
import type { FrameResult } from "../worker/protocol";
import { warningsUnder } from "../applyRecognized";
import { loadPhoto } from "../photoFile";
import { fitLongEdge, STILL_MAX_EDGE, viewportOf } from "./viewport";
import { DetectionOverlay } from "./DetectionOverlay";
import { EMPTY_CAPTURE, feedFrame, reasonOf, STABLE_FRAMES, votesOf } from "./autoCapture";
import { LayoutGuide } from "./LayoutGuide";
import { useRotation } from "./orientation/useRotation";
import { useSessionStats } from "./useSessionStats";
import { RoiOverlay } from "./RoiOverlay";
import { useCameraStream } from "./useCameraStream";
import { useCanvasPreview } from "./useCanvasPreview";
import { useLiveDetect } from "./useLiveDetect";

/** 一直没认出有效牌面就停流，省电防烫（用户拍板 60 秒） */
const IDLE_STOP_MS = 60_000;

export interface Capture {
  blob: Blob;
  result: RecognitionResult;
}

/**
 * 全屏取景：不用框选，识别线程自己在整帧里找到手牌、只识别它周围那一块；最近几帧里认稳了同一副牌就自动定格。
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
  const [live, setLive] = useState<FrameResult | null>(null);
  const [gate, setGate] = useState(EMPTY_CAPTURE);
  const { rotation, source: rotationSource, toggle: toggleRotation } = useRotation();
  const [paused, setPaused] = useState(false);
  const [openedAt] = useState(() => Date.now());

  /** 相册那张正在推理：实时循环让开，免得两边抢 Worker 互相把对方的帧挤掉 */
  const [stillBusy, setStillBusy] = useState(false);
  /** 定格的视觉回执：iOS 全系没有 navigator.vibrate，只靠震动等于没有反馈 */
  const [flash, setFlash] = useState(false);
  const [picked, setPicked] = useState<Detection | null>(null);
  const [guide, setGuide] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const captureRef = useRef(EMPTY_CAPTURE);
  const frameRotationRef = useRef<FrameResult["rotation"]>(0);
  /** 相册那张在途的 frameId；null = 没有 */
  const stillRef = useRef<number | null>(null);
  const grabbingRef = useRef(false);
  const lastGoodRef = useRef(openedAt);

  // 看「怎么摆」时停流、停识别：人在读说明，不该对着桌面偷偷定格
  const active = !paused && !stillBusy && !guide;
  const lost = useCallback(() => setPaused(true), []);
  const { videoRef, error: camError, ready } = useCameraStream(active, lost);
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  // 两个回调都是稳定引用：直接进依赖数组，不会让下面的订阅每次渲染都重建
  const { onFrame: countFrame, finish: finishSession } = useSessionStats(mode, {
    rotation,
    rotationSource,
    viewport: area && { width: area.clientWidth, height: area.clientHeight },
  });
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

  const capture = useCallback(
    async (how: "auto" | "manual" | "album") => {
      if (!detector || grabbingRef.current) return;
      grabbingRef.current = true;
      try {
        // 照片、检测框、识别结果由 Worker 从同一帧里一起给出：分开取就可能错位，回流出来的训练数据也跟着错
        const got = await detector.grab();
        const modelId = RECOGNITION_MODEL?.id;
        if (!got || !modelId) return;
        const { blob, ms, detections, hand, warnings, provenance } = got;
        finishSession(how);
        onCapture({ blob, result: { modelId, ms, detections, hand, warnings, provenance } });
      } finally {
        grabbingRef.current = false;
      }
    },
    [detector, onCapture, finishSession],
  );

  const onFrame = useCallback(
    (r: FrameResult) => {
      setLive(r);
      // 手机一转，之前攒的票是另一个方向下认出来的：作废重数
      if (r.rotation !== frameRotationRef.current) {
        frameRotationRef.current = r.rotation;
        captureRef.current = EMPTY_CAPTURE;
      }
      const out = feedFrame(captureRef.current, {
        ...r,
        warnings: warningsUnder(r.warnings, rules),
      });
      captureRef.current = out.state;
      countFrame(r, out.state);
      setGate(out.state);
      if (votesOf(out.state) > 0) lastGoodRef.current = Date.now();
      if (out.fire) {
        navigator.vibrate?.(30);
        setFlash(true);
        void capture("auto");
      }
    },
    [capture, countFrame, rules],
  );

  // 相册那张是一次性的：结果一到就直接定格，不参与稳定判断。实时循环此刻停着，单独收
  useEffect(() => {
    if (!detector) return;
    return detector.onResult((r) => {
      const still = stillRef.current;
      if (still === null) return;
      if (r) {
        if (r.frameId !== still) return;
        stillRef.current = null;
        setStillBusy(false);
        setLive(r);
        setFlash(true);
        void capture("album");
        return;
      }
      // null = 识别线程废了（相册那张不会被背压丢掉，Worker 会排到当前帧后面跑）
      stillRef.current = null;
      setStillBusy(false);
      setError("这张没识别成功，请重试");
    });
  }, [detector, capture]);

  const runStill = useCallback(
    async (file: File) => {
      if (!detector) return;
      setStillBusy(true);
      try {
        // 相册原图动辄 4000px：按实时帧的尺度缩小再送（识别尺度一致，定格照片也不至于太大）
        const src = await loadPhoto(file);
        const size = fitLongEdge(src.width, src.height, STILL_MAX_EDGE);
        const canvas = new OffscreenCanvas(size.width, size.height);
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, 0, 0, size.width, size.height);
        src.close();
        stillRef.current = detector.infer(canvas.transferToImageBitmap(), "still");
      } catch (err) {
        // 失败要复位：否则 stillBusy 一直为真，实时取景再也不会恢复
        stillRef.current = null;
        setStillBusy(false);
        setError(err instanceof Error ? err.message : "这张照片处理失败");
      }
    },
    [detector],
  );

  useLiveDetect({
    detector,
    videoRef,
    view: { rotation, known: rotationSource !== "none" },
    active: active && ready,
    onFrame,
  });

  /** 检测框（整帧像素）画回屏幕要用的摆放；取景区域或画面尺寸还没就绪时不画 */
  const view = live && area ? viewportOf(live, area) : null;

  /** 相机用不了（权限、无设备、占用、非 HTTPS）：快门没有意义，给相册入口 */
  const camBroken = camError !== null;
  const canShoot = detector !== null && ready && painted && live !== null && !camBroken;
  const downloading = !detector && !error && progress < 1;
  /** 右上角的小字进度：认出几张（副露按 3 张折算，多认了照实显示）· 最近几帧里有几帧一致 */
  const total = live ? live.hand.closed.length + live.hand.melds.length * 3 : 0;
  const progressText = live
    ? `${total}/14 · ${Math.min(STABLE_FRAMES, votesOf(gate))}/${STABLE_FRAMES}`
    : null;
  const reason = reasonOf(gate);
  /**
   * 手机横持而页面没跟着转时，把关闭键、进度、底栏这些整体转过去：一个与屏幕同心、宽高互换的容器。
   * 画面与检测框不转——屏幕本身已经横过来了。
   */
  const chromeStyle =
    rotation !== 0 && area
      ? {
          left: "50%",
          top: "50%",
          width: area.clientHeight,
          height: area.clientWidth,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }
      : { inset: 0 };

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
        // 画面铺满整屏，底栏浮在上面（沉浸）
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
        {live && view && !paused && !stillBusy && (
          <>
            <RoiOverlay frame={live} view={view} />
            {mode === "calc" && (
              <DetectionOverlay
                detections={live.detections}
                rotation={live.rotation}
                view={view}
                onPick={setPicked}
              />
            )}
          </>
        )}
        {flash && (
          <span
            className="pointer-events-none absolute inset-0 bg-white/70"
            onAnimationEnd={() => setFlash(false)}
            style={{ animation: "riichi-flash 220ms ease-out forwards" }}
            aria-hidden
          />
        )}
      </div>

      <div
        // 容器自己不接事件（下面的检测框要能点），要接的孩子各自声明
        className="pointer-events-none absolute"
        style={chromeStyle}
        data-testid="camera-chrome"
        data-rotation={rotation}
      >
        {/* 认稳手牌之前一直留着：画面里一有框就撤掉的话只闪一秒，没人来得及读 */}
        {!paused && !reason && votesOf(gate) === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-white/80 drop-shadow">
            对准手牌，牌河留在画面上方
          </p>
        )}
        {paused && (
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/70 text-white"
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
          className="pointer-events-auto absolute left-3 top-3 rounded-full bg-black/50 p-2 text-white"
        >
          <X className="h-5 w-5" />
        </button>
        {progressText && !paused && (
          <span
            className={`pointer-events-none absolute right-3 top-4 text-xs tabular drop-shadow ${total > 14 ? "text-neg" : "text-white/80"}`}
            data-testid="camera-progress"
          >
            {progressText}
          </span>
        )}
        {reason && !paused && (
          <p
            className="pointer-events-none absolute inset-x-12 top-12 rounded-lg bg-black/60 px-3 py-1.5 text-center text-xs text-white"
            data-testid="camera-reason"
          >
            {reason}
          </p>
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
            className="pointer-events-auto absolute inset-x-3 top-3 rounded-lg bg-black/70 px-3 py-2 text-sm text-white"
          >
            {RECOGNITION_CLASSES[picked.cls] ?? "?"} · 置信度 {Math.round(picked.conf * 100)}%
          </button>
        )}
        <div
          data-testid="camera-panel"
          // 底栏浮在画面上：自带一层渐变压暗，字才读得清
          className="pointer-events-auto absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/85 via-black/70 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 text-white"
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
            底栏不能伸缩，否则画面下沿跟着跳 */}
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
                      if (f) void runStill(f);
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={toggleRotation}
                aria-label={rotation === 0 ? "切到横屏" : "切回竖屏"}
                aria-pressed={rotation !== 0}
                data-testid="camera-rotate"
                className={`inline-flex h-8 shrink-0 items-center rounded-lg border px-2.5 text-white ${rotation === 0 ? "border-white/40" : "border-accent bg-accent/20"}`}
              >
                <RotateCw className="h-4 w-4" />
              </button>
              {canShoot && (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => void capture("manual")}
                  data-testid="camera-shutter"
                >
                  快门
                </Button>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
