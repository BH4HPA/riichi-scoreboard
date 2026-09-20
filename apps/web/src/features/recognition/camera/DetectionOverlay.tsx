import { RECOGNITION_CLASSES, tileOfClassId, type Detection } from "@riichi/core";
import { TileFace } from "@/features/hand/TileFace";
import { boxOnScreen, type Viewport } from "./viewport";

/**
 * 算点数页的检测框叠加。**标签画牌图不画文字**：38 类的 `1m`/`0p` 小字在手机上糊成一团，
 * 框角贴一张同款牌图，一眼就知道模型认成了什么。牌背没有对应的牌图，退回文字。
 * 框是整帧的像素坐标，按画面在屏幕上的摆放映射回去。
 */
export function DetectionOverlay({
  detections,
  view,
  onPick,
}: {
  detections: readonly Detection[];
  view: Viewport;
  onPick: (d: Detection) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {detections.map((d, i) => {
        const tile = tileOfClassId(d.cls);
        const style = boxOnScreen(d.box, view);
        if (!style) return null;
        return (
          <button
            key={i}
            type="button"
            style={style}
            onClick={() => onPick(d)}
            className="pointer-events-auto absolute rounded-sm border border-accent/90"
            aria-label={`${RECOGNITION_CLASSES[d.cls] ?? "?"} ${Math.round(d.conf * 100)}%`}
          >
            <span className="absolute -left-0.5 -top-0.5 origin-top-left scale-[0.55]">
              {tile === null ? (
                <span className="rounded bg-black/70 px-1 text-[10px] text-white">背</span>
              ) : (
                <TileFace tile={tile} size="xs" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
