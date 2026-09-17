import { useState } from "react";

/** 表单里的立直勾选 + 已经并入过的立直声明。 */
export interface RiichiSeed {
  riichi: boolean[];
  seeded: boolean[];
}

/**
 * 把本局立直声明并进表单勾选：只勾新声明、没并入过的座位；用户手动取消过的（已并入）不会被勾回。
 * 无变化时原样返回同一对象。
 */
export function seedRiichi(current: RiichiSeed, declared: readonly boolean[]): RiichiSeed {
  if (declared.every((d, s) => !d || current.seeded[s])) return current;
  return {
    riichi: current.riichi.map((r, s) => r || (declared[s]! && !current.seeded[s])),
    seeded: current.seeded.map((x, s) => x || declared[s]!),
  };
}

/** 不存草稿的结算表单（流局、途中流局）用：以本局声明为初值，打开期间的新声明也并进来。 */
export function useSeededRiichi(declared: readonly boolean[]) {
  const [state, setState] = useState<RiichiSeed>(() => ({
    riichi: [...declared],
    seeded: [...declared],
  }));
  // 渲染期按新声明调整状态（React 推荐的「随 props 调整 state」写法）；无新声明时原样返回，不会循环
  const next = seedRiichi(state, declared);
  if (next !== state) setState(next);
  return [next.riichi, (riichi: boolean[]) => setState((st) => ({ ...st, riichi }))] as const;
}
