import type { FrameResult } from "../worker/protocol";
import { boxOnScreen, type Viewport } from "./viewport";

/**
 * 「现在盯着哪儿」：锁定的识别范围画四个角，被采信的牌描一圈细框。
 * 没有可拖的取景框以后，这是用户判断「它找对手牌了没有」的唯一依据——框住了牌河就知道该挪一挪。
 */
export function RoiOverlay({ frame, view }: { frame: FrameResult; view: Viewport }) {
  const whole =
    frame.crop[2] - frame.crop[0] === frame.frame.width &&
    frame.crop[3] - frame.crop[1] === frame.frame.height;
  const roi = whole ? null : boxOnScreen(frame.crop, frame.rotation, view);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {roi && (
        <div className="absolute" style={roi} data-testid="camera-roi">
          {(
            [
              "left-0 top-0 border-l-2 border-t-2",
              "right-0 top-0 border-r-2 border-t-2",
              "bottom-0 left-0 border-b-2 border-l-2",
              "bottom-0 right-0 border-b-2 border-r-2",
            ] as const
          ).map((corner) => (
            <span key={corner} className={`absolute h-4 w-4 border-accent/90 ${corner}`} />
          ))}
        </div>
      )}
      {frame.provenance.usedDetections.map((i) => {
        const style = boxOnScreen(frame.detections[i]!.box, frame.rotation, view);
        return (
          style && (
            <span key={i} style={style} className="absolute rounded-sm border border-white/70" />
          )
        );
      })}
    </div>
  );
}
