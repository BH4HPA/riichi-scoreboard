import {
  akaLimit,
  baseTile,
  isAka,
  tileSuit,
  type HandInput,
  type Meld,
  type RoomRules,
  type Tile,
} from "@riichi/core";
import { hasLoc, type TileLoc } from "../../hand/tileLoc";
import type { ValueDraft } from "../valueDraft";

/**
 * 手牌里赤五的规则收口。布局层不看规则、照实记（暗杠两张都认成赤就是两张），裁剪只在这里做一次：
 * - 不用赤五的房间全部折回普通五。照片里确实是赤，只是这桌不算，不打记号。
 * - 用赤五的房间只折超出每色上限的（akaLimit；各色上限之和恰为 akaCount，总数不必另查）。
 *   超额说明模型至少认错了一张，但认错的是哪张不知道：先到先得只是给个合法的默认值，
 *   所以这个花色的赤五**全部**标成要核对，留下的那张也标 —— 否则用户只会去点折掉的那张，
 *   而它因为名额已满改不回赤。
 */
export function capAka(
  closed: readonly Tile[],
  melds: readonly Meld[],
  rules: RoomRules,
): { closed: Tile[]; melds: Meld[]; capped: TileLoc[] } {
  const { akaCount } = rules.hand;
  const seen: Record<"m" | "p" | "s", TileLoc[]> = { m: [], p: [], s: [] };
  const cap = (t: Tile, loc: TileLoc): Tile => {
    if (!isAka(t)) return t;
    if (akaCount === 0) return baseTile(t);
    const suit = tileSuit(t) as "m" | "p" | "s";
    seen[suit].push(loc);
    return seen[suit].length <= akaLimit(suit, akaCount) ? t : baseTile(t);
  };
  const nextClosed = closed.map((t, i) => cap(t, { area: "closed", i }));
  const nextMelds = melds.map((m, i) => ({
    ...m,
    tiles: m.tiles.map((t, j) => cap(t, { area: "meld", i, j })),
  }));
  const capped = (["m", "p", "s"] as const).flatMap((suit) =>
    seen[suit].length > akaLimit(suit, akaCount) ? seen[suit] : [],
  );
  return { closed: nextClosed, melds: nextMelds, capped };
}

/**
 * 规则在牌面录好之后才改（拍照算点数页的规则弹窗）：把手牌收口到新规则，免得服务端校验报错、
 * 而界面上又改不动（比如一发被规则关掉后旗标藏起来了，勾着的一发却还在）。
 * 与识别时同一套赤五裁剪；指示牌按新规则截断、不用赤五时折回；无里宝或未立直清里宝；无一发清一发。
 * 被折的赤五打「请核对」记号。什么都不用改时原样返回同一个对象。
 */
export function conformDraftToRules(draft: ValueDraft, rules: RoomRules): ValueDraft {
  const prev = draft.hand;
  const { closed, melds, capped } = capAka(prev.closed, prev.melds, rules);
  const fold = (t: Tile) => (rules.hand.akaCount === 0 && isAka(t) ? baseTile(t) : t);
  const doraIndicators = prev.doraIndicators.map(fold).slice(0, rules.hand.kanDora ? 5 : 1);
  const riichi = prev.riichi || prev.doubleRiichi;
  const uraIndicators =
    rules.hand.uraDora && riichi
      ? prev.uraIndicators.map(fold).slice(0, doraIndicators.length)
      : [];
  const winIndex = prev.closed.lastIndexOf(prev.winTile);
  const hand: HandInput = {
    ...prev,
    closed,
    melds,
    winTile: winIndex >= 0 ? closed[winIndex]! : prev.winTile,
    doraIndicators,
    uraIndicators,
    ippatsu: prev.ippatsu && rules.hand.ippatsu,
  };
  if (JSON.stringify(hand) === JSON.stringify(prev)) return draft;
  const rec = draft.recognition;
  return {
    ...draft,
    hand,
    evaluated: null,
    recognition: rec && {
      ...rec,
      // 截掉的指示牌不留悬空记号
      uncertain: [
        ...rec.uncertain.filter(
          (l) =>
            (l.area !== "dora" || l.i < doraIndicators.length) &&
            (l.area !== "ura" || l.i < uraIndicators.length),
        ),
        ...capped.filter((l) => !hasLoc(rec.uncertain, l)),
      ],
    },
  };
}
