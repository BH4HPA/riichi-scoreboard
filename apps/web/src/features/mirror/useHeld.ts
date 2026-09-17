import { useEffect, useState } from "react";

/**
 * 值暂时变空时继续显示上一份，超过 holdMs 仍为空才真的撤掉；保留期间 stale 为 true。
 * 手机上改一下立直或牌，引擎要重算约 300 ms，这期间镜像里的牌面、番符、四家增减会先变空再回来 ——
 * 电视上表现为整块闪一下。按住旧值调暗即可，协议不用区分「重算中」与「真的清空」。
 */
export function useHeld<T>(value: T | null, holdMs: number): { value: T | null; stale: boolean } {
  const [held, setHeld] = useState<T | null>(value);
  // 渲染期同步最新非空值（React 的「依据 props 调整 state」写法），不走 effect 以免多闪一帧
  if (value !== null && value !== held) setHeld(value);
  useEffect(() => {
    if (value !== null) return;
    const timer = setTimeout(() => setHeld(null), holdMs);
    return () => clearTimeout(timer);
  }, [value, holdMs]);
  const shown = value ?? held;
  return { value: shown, stale: value === null && shown !== null };
}
