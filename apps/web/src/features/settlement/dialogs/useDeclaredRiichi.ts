import { useEffect, useRef } from "react";
import { seedRiichi } from "../riichiSeed";

interface RiichiState {
  riichi: boolean[];
  seededRiichi: boolean[];
}

/**
 * 弹窗开着时有人按了立直：把新声明并进表单勾选（用户取消过的不勾回）。
 * `afterSeed` 拿到并入前的状态与并入后的勾选，据此调整和牌者手牌侧的立直；
 * 声明数组每次广播都换引用，按内容比较。
 */
export function useDeclaredRiichi<S extends RiichiState>(
  form: { update(fn: (st: S) => S): void },
  declared: readonly boolean[],
  afterSeed: (before: S, riichi: boolean[]) => S,
): void {
  const latest = useRef({ form, declared, afterSeed });
  useEffect(() => {
    latest.current = { form, declared, afterSeed };
  });
  const key = declared.join();
  useEffect(() => {
    const { form, declared, afterSeed } = latest.current;
    form.update((st) => {
      const seed = seedRiichi({ riichi: st.riichi, seeded: st.seededRiichi }, declared);
      if (seed.riichi === st.riichi) return st;
      return { ...afterSeed(st, seed.riichi), riichi: seed.riichi, seededRiichi: seed.seeded };
    });
  }, [key]);
}
