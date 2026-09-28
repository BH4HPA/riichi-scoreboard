import { useLayoutEffect } from "react";
import { useScale, type ConsoleScale } from "./store";

/** 与 Tailwind 的 rem 换算基准一致：rem 值都按 16px 根字号写 */
const BASE_PX = 16;

/**
 * 主控台挂载期间按档位放大根字号，所有 rem 尺寸（文字、间距、牌图）一起变；卸载时还原，手机与首页不受影响。
 * 100% 时不碰根字号，与改动前完全一致。Tailwind 的 `sm:` 等断点按 16px 计算、不随档位变化；
 * 主控台自己的双栏门槛随档位变（见 split/wideQuery）。
 */
export function useConsoleScale(): ConsoleScale {
  const scale = useScale();
  useLayoutEffect(() => {
    if (scale === 1) return;
    const root = document.documentElement;
    const prev = root.style.fontSize;
    root.style.fontSize = `${BASE_PX * scale}px`;
    return () => {
      root.style.fontSize = prev;
    };
  }, [scale]);
  return scale;
}
