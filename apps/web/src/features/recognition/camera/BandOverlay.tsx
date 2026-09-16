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
        className="pointer-events-auto absolute inset-x-0 flex h-8 items-center justify-center"
        style={{ bottom: `calc(${outside} - 1rem)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e.clientY);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && drag(e.clientY)}
        role="slider"
        aria-label="取景带高度"
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
