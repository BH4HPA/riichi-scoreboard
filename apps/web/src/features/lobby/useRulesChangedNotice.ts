import { useEffect, useRef } from "react";
import { rulesKey, type RoomRules } from "@riichi/core";
import { useRoomStore } from "@/ws/store";

/**
 * 别人改了规则、服务端因此清掉了我的准备时提示一句（准备键无声变回「准备」容易被忽略）。
 * 返回 `own(send)`：包住自己发出的改规则命令，期间到达的变化不提示。
 */
export function useRulesChangedNotice(rules: RoomRules, ready: boolean) {
  const notify = useRoomStore((s) => s.notify);
  const key = rulesKey(rules);
  const prev = useRef({ key, ready });
  const mine = useRef(false);

  useEffect(() => {
    const p = prev.current;
    if (key !== p.key && p.ready && !ready && !mine.current) {
      notify("info", "规则已修改，请重新准备");
    }
    prev.current = { key, ready };
  }, [key, ready, notify]);

  // 服务端先广播状态再回 ack，所以等命令返回再清标记不会漏掉自己的那次变化
  return async <T>(send: () => Promise<T>): Promise<T> => {
    mine.current = true;
    try {
      return await send();
    } finally {
      mine.current = false;
    }
  };
}
