import { HANDLE_PX, HISTORY_MIN_PX, SCORE_MIN_PX } from "./clampSplit";

/** 宽屏壳的左右内边距（`p-6` = 1.5rem，随档位放大） */
const SHELL_PADDING_PX = 24;
/**
 * 100% 档沿用原来的 1280 门槛：按最小宽度推出来是 1184，会让 1194 宽的 iPad Pro 11 横屏改走双栏，
 * 而那时拖动范围几乎为零。放大后的门槛都高于它（115% ≈ 1360，130% ≈ 1535），不受这条下限影响。
 */
const WIDE_FLOOR_PX = 1280;

/** 放得下两栏最小宽度 + 拖动条 + 内边距的最小视口宽度（CSS px，与根字号无关）。 */
export function wideConsoleMinWidth(scale: number): number {
  const derived = (SCORE_MIN_PX + HISTORY_MIN_PX + 2 * SHELL_PADDING_PX) * scale + HANDLE_PX;
  return Math.max(WIDE_FLOOR_PX, Math.ceil(derived));
}

/** 主控台双栏布局的媒体查询；以下（iPad 横屏 1024 / 1180）走单栏 + 抽屉。 */
export function wideConsoleQuery(scale: number): string {
  return `(min-width: ${wideConsoleMinWidth(scale)}px)`;
}
