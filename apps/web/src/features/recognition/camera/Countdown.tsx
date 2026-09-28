/** 圆环半径与周长（viewBox 100×100） */
const R = 44;
const C = 2 * Math.PI * R;

/**
 * 画面正中的定格倒计时：大号数字 + 跟着票数填满的环。
 * 半透明、不接事件：它盖在手牌上方，不能挡住人对准，也不能吃掉快门以外的点击。
 */
export function Countdown({ digit, progress }: { digit: number; progress: number }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 opacity-80"
      data-testid="camera-countdown"
      aria-live="polite"
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="rgb(0 0 0 / 0.35)"
          stroke="rgb(255 255 255 / 0.3)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          className="text-accent transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <span
        key={digit}
        className="absolute inset-0 flex items-center justify-center text-5xl font-semibold tabular text-white drop-shadow"
        style={{ animation: "riichi-pop 180ms ease-out" }}
      >
        {digit}
      </span>
    </div>
  );
}
