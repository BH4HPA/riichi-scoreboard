import { cn } from "@/lib/utils";

const R = 44;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** 套在圆形图标外的下载进度环：进度未知（0）时转圈，已知时按比例画弧。父元素需 `relative`。 */
export function LoadRing({ progress, className }: { progress: number; className?: string }) {
  const known = progress > 0;
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full -rotate-90",
        !known && "animate-spin",
        className,
      )}
    >
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="8"
      />
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - (known ? progress : 0.25))}
      />
    </svg>
  );
}
