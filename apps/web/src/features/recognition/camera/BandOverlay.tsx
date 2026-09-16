import { useRef } from "react";
import { BAND_MAX, BAND_MIN, clampBand, GUIDE_RATIO } from "./band";

/**
 * 取景带：带外压暗，牌河自然落进暗区 —— 「看着它变灰」，而不是盲裁一刀再祈祷。
 * 画出来的引导框比实际裁剪范围窄一圈（见 band.ts 的 GUIDE_RATIO），骑边的牌仍在裁剪内。
 * 下沿一个把手可以拖高度；一次触摸拖到底，不做双端拖拽。
 */
export function BandOverlay({
  band,
  onBandChange,
  hint,
}: {
  band: number;
  onBandChange: (next: number) => void;
  hint: string | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const guide = band * GUIDE_RATIO;
  const outside = `${((1 - guide) / 2) * 100}%`;

  const drag = (clientY: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.height <= 0) return;
    // 把手在下沿：半高 = 指尖到中线的距离
    const half = Math.abs(clientY - (rect.top + rect.height / 2)) / rect.height;
    onBandChange(clampBand((half * 2) / GUIDE_RATIO));
  };

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 bg-black/60" style={{ height: outside }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/60" style={{ height: outside }} />
      <div
        className="absolute inset-x-0 border-y-2 border-accent/80"
        style={{ top: outside, bottom: outside }}
      >
        {hint && (
          <div className="absolute inset-x-0 -top-7 text-center text-xs text-white/90 drop-shadow">
            {hint}
          </div>
        )}
      </div>
      <div
        // touch-none 必不可少：不声明的话浏览器会把纵向拖拽当成页面滚动手势接管，
        // 派发 pointercancel，setPointerCapture 也拦不住，拖到一半就掉线。
        // z-10 压在检测框之上：标注模式下带沿附近的框会抢走把手的触摸。
        className="pointer-events-auto absolute inset-x-0 z-10 flex h-8 touch-none items-center justify-center"
        style={{ bottom: `calc(${outside} - 1rem)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e.clientY);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && drag(e.clientY)}
        onKeyDown={(e) => {
          const step =
            e.key === "ArrowUp"
              ? -0.05
              : e.key === "ArrowDown"
                ? 0.05
                : e.key === "Home"
                  ? -1
                  : e.key === "End"
                    ? 1
                    : 0;
          if (step === 0) return;
          e.preventDefault();
          onBandChange(clampBand(band + step));
        }}
        role="slider"
        aria-label="取景带高度"
        aria-orientation="vertical"
        aria-valuemin={BAND_MIN * 100}
        aria-valuemax={BAND_MAX * 100}
        aria-valuenow={Math.round(band * 100)}
        tabIndex={0}
      >
        <span className="h-1 w-12 rounded-full bg-white/80 shadow" />
      </div>
    </div>
  );
}
