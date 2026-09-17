import type { GameState, HistoryEntry } from "../types/state";
import { ENTRY_KIND_LABELS } from "./describe";
import { roundLabel } from "./round";

/** 历史条目的一句短描述：「东1局0本场 北家小林荣和」。 */
function shortEntry(entry: HistoryEntry): string {
  const who =
    entry.kind === "tsumo"
      ? entry.names[entry.win.winner]
      : entry.kind === "ron"
        ? entry.wins.map((w) => entry.names[w.winner]).join("、")
        : entry.kind === "chombo"
          ? entry.names[entry.offender]
          : "";
  return `${roundLabel(entry.kyoku, entry.honba)} ${who}${ENTRY_KIND_LABELS[entry.kind]}`;
}

/**
 * 撤销/重做前后的局面差异 → 被撤掉（或重做回来）的是哪一笔。
 * 一次可能进出多条（终局时的供托分配跟着结算一起），取其中最新的非供托条目；
 * 没有条目变化但对局状态切换的是「终局结算」。
 */
export function describeRevert(before: GameState, after: GameState): string {
  const [longer, shorter] =
    before.history.length >= after.history.length ? [before, after] : [after, before];
  const moved = longer.history.slice(0, longer.history.length - shorter.history.length);
  const entry = moved.find((e) => e.kind !== "kyotaku");
  if (entry) return shortEntry(entry);
  if (before.status !== after.status) return "终局结算";
  return "上一步操作";
}
