import { useRef } from "react";
import { BAND_MAX, BAND_MIN, clampBand, clampCenter, GUIDE_RATIO } from "./band";

/**
 * 取景带：带外压暗，牌河自然落进暗区 —— 「看着它变灰」，而不是盲裁一刀再祈祷。
 * 画出来的引导框比实际裁剪范围窄一圈（见 band.ts 的 GUIDE_RATIO），骑边的牌仍在裁剪内。
 * 下沿把手拖高度；传了 `onCenterChange`（相册照片）时带身也能上下拖——实时取景靠挪手机，照片挪不了。
 */
export function BandOverlay({
  band,
  center = 0.5,
  onBandChange,
  onCenterChange,
  hint,
}: {
  band: number;
  /** 带中线位置（占区域高度的比例） */
  center?: number;
  onBandChange: (next: number) => void;
  onCenterChange?: ((next: number) => void) | undefined;
  hint: string | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  /** 拖带身时，指尖与中线的初始偏移（比例），免得一按下中线就跳到指尖 */
  const grabRef = useRef(0);
  const mid = clampCenter(center, band);
  const guide = band * GUIDE_RATIO;
  const top = `${(mid - guide / 2) * 100}%`;
  const bottom = `${(1 - mid - guide / 2) * 100}%`;

  const fraction = (clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    return rect && rect.height > 0 ? (clientY - rect.top) / rect.height : null;
  };
  const resize = (clientY: number) => {
    const y = fraction(clientY);
    // 把手在下沿：半高 = 指尖到中线的距离
    if (y !== null) onBandChange(clampBand((Math.abs(y - mid) * 2) / GUIDE_RATIO));
  };

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 bg-black/60" style={{ height: top }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/60" style={{ height: bottom }} />
      <div
        className={
          onCenterChange
            ? "pointer-events-auto absolute inset-x-0 cursor-grab touch-none border-y-2 border-accent/80"
            : "absolute inset-x-0 border-y-2 border-accent/80"
        }
        style={{ top, bottom }}
        data-testid="band-body"
        {...(onCenterChange
          ? {
              onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
                const y = fraction(e.clientY);
                if (y === null) return;
                grabRef.current = y - mid;
                e.currentTarget.setPointerCapture(e.pointerId);
              },
              onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const y = fraction(e.clientY);
                if (y !== null) onCenterChange(clampCenter(y - grabRef.current, band));
              },
            }
          : {})}
      >
        {hint && (
          <div className="pointer-events-none absolute inset-x-0 -top-7 text-center text-xs text-white/90 drop-shadow">
            {hint}
          </div>
        )}
      </div>
      <div
        // touch-none 必不可少：不声明的话浏览器会把纵向拖拽当成页面滚动手势接管，
        // 派发 pointercancel，setPointerCapture 也拦不住，拖到一半就掉线。
        // z-10 压在检测框之上：标注模式下带沿附近的框会抢走把手的触摸。
        className="pointer-events-auto absolute inset-x-0 z-10 flex h-8 touch-none items-center justify-center"
        style={{ bottom: `calc(${bottom} - 1rem)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          resize(e.clientY);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && resize(e.clientY)}
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
