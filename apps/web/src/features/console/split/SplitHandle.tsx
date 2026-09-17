import type { PointerEvent } from "react";

/** 两栏之间的拖动条：拖动改比例；聚焦后左右方向键微调。 */
export function SplitHandle({
  ratio,
  ratioAt,
  onChange,
}: {
  ratio: number;
  ratioAt: (clientX: number) => number;
  onChange: (ratio: number) => void;
}) {
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(ratioAt(e.clientX));
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整比分与历史的宽度"
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      className="group flex cursor-col-resize touch-none items-center justify-center outline-none"
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={move}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(ratio - 0.02);
        if (e.key === "ArrowRight") onChange(ratio + 0.02);
      }}
    >
      <span className="h-12 w-1 rounded-full bg-border transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
    </div>
  );
}
