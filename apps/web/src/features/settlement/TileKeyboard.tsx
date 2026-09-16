import { useState } from "react";
import { X } from "lucide-react";
import {
  AKA_TILES,
  ALL_TILES,
  akaLimit,
  akaOf,
  allHandTiles,
  baseTile,
  isAka,
  isHonor,
  sameTile,
  tileNumber,
  tileSuit,
  yakumanLabel,
  type EvaluatedHand,
  type HandInput,
  type Meld,
  type RoomRules,
  type Tile,
} from "@riichi/core";
import { CheckRow, Label } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { TileFace } from "@/features/hand/TileFace";
import { hasLoc, type TileLoc } from "@/features/hand/tileLoc";
import { YakuChips } from "@/features/hand/YakuChips";
import { closedCapacity, isHandComplete } from "./valueDraft";

type Target = "closed" | "dora" | "ura" | "chi" | "pon" | "kan" | "ankan";

const TARGET_LABELS: Record<Target, string> = {
  closed: "手牌",
  dora: "宝牌指示",
  ura: "里宝指示",
  chi: "吃",
  pon: "碰",
  kan: "明杠",
  ankan: "暗杠",
};

/** 同一基础牌（忽略赤标记）已录入张数。 */
function countTile(hand: HandInput, tile: Tile): number {
  return allHandTiles(hand).filter((t) => sameTile(t, tile)).length;
}

/** 该赤五是否还能再录入：受规则总数与同花色上限约束。 */
function akaAvailable(hand: HandInput, tile: Tile, rules: RoomRules): boolean {
  if (!isAka(tile)) return true;
  const all = allHandTiles(hand);
  const total = all.filter(isAka).length;
  if (total >= rules.hand.akaCount) return false;
  const suit = tileSuit(tile) as "m" | "p" | "s";
  const inSuit = all.filter((t) => isAka(t) && tileSuit(t) === suit).length;
  return inSuit < akaLimit(suit, rules.hand.akaCount);
}

export function TileKeyboard({
  hand,
  onChange,
  rules,
  evaluated,
  evaluating,
  evalError,
  uncertain = [],
}: {
  hand: HandInput;
  onChange: (next: HandInput) => void;
  rules: RoomRules;
  /** 由 ValuePicker 在手牌录满后自动评估 */
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  evalError: string | null;
  /** 识别没把握的位置，给对应的牌打记号 */
  uncertain?: readonly TileLoc[];
}) {
  const marked = (loc: TileLoc) => hasLoc(uncertain, loc);
  const [target, setTarget] = useState<Target>("closed");
  const capacity = closedCapacity(hand);
  const complete = isHandComplete(hand);
  const akaEnabled = rules.hand.akaCount > 0;

  const update = (patch: Partial<HandInput>) => onChange({ ...hand, ...patch });

  const addMeld = (meld: Meld) => {
    const next = { ...hand, melds: [...hand.melds, meld] };
    const cap = closedCapacity(next);
    next.closed = next.closed.slice(0, cap);
    onChange(next);
    setTarget("closed");
  };

  const disabledOnKeyboard = (tile: Tile): boolean => {
    if (target === "closed") {
      return (
        hand.closed.length >= capacity ||
        countTile(hand, tile) >= 4 ||
        !akaAvailable(hand, tile, rules)
      );
    }
    if (target === "dora" || target === "ura") return false;
    if (target === "chi") return isHonor(tile) || tileNumber(tile) > 7 || isAka(tile);
    if (target === "pon") return countTile(hand, tile) > 1 || isAka(tile);
    return countTile(hand, tile) > 0 || isAka(tile);
  };

  const tap = (tile: Tile) => {
    if (disabledOnKeyboard(tile)) return;
    switch (target) {
      case "closed":
        update({ closed: [...hand.closed, tile], winTile: tile });
        return;
      case "dora":
        if (hand.doraIndicators.length < (rules.hand.kanDora ? 5 : 1))
          update({ doraIndicators: [...hand.doraIndicators, tile] });
        return;
      case "ura":
        if (hand.uraIndicators.length < hand.doraIndicators.length)
          update({ uraIndicators: [...hand.uraIndicators, tile] });
        return;
      case "chi": {
        const b = baseTile(tile);
        addMeld({ open: true, tiles: [b, b + 1, b + 2] });
        return;
      }
      case "pon":
        addMeld({ open: true, tiles: [tile, tile, tile] });
        return;
      case "kan":
      case "ankan":
        addMeld({ open: target === "kan", tiles: [tile, tile, tile, tile] });
        return;
    }
  };

  const removeClosed = (index: number) => {
    const closed = hand.closed.filter((_, i) => i !== index);
    update({
      closed,
      winTile: closed.includes(hand.winTile) ? hand.winTile : (closed[closed.length - 1] ?? 0),
    });
  };

  /** 点副露里的五：在赤/非赤之间切换（受上限约束）。 */
  const toggleMeldAka = (meldIndex: number, tileIndex: number) => {
    const meld = hand.melds[meldIndex]!;
    const tile = meld.tiles[tileIndex]!;
    if (tileNumber(tile) !== 5 || isHonor(tile)) return;
    const next = isAka(tile) ? baseTile(tile) : akaOf(tile);
    if (isAka(next) && !akaAvailable(hand, next, rules)) return;
    const tiles = meld.tiles.map((t, k) => (k === tileIndex ? next : t));
    update({ melds: hand.melds.map((m, k) => (k === meldIndex ? { ...m, tiles } : m)) });
  };

  const distinctClosed = [...new Set(hand.closed)];
  // 同码多张时只给最后一张标和张（与 HandStrip 一致）
  const winIndex = hand.closed.lastIndexOf(hand.winTile);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <Label>
            手牌 {hand.closed.length}/{capacity}（含和张）
          </Label>
          {hand.closed.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted hover:text-neg"
              onClick={() => update({ closed: [], winTile: 0 })}
            >
              清空
            </button>
          )}
        </div>
        <div
          className="mt-1 flex min-h-12 flex-wrap items-end gap-y-1.5 rounded-lg border border-dashed border-border p-1.5"
          data-testid="hand-area"
        >
          <div className="flex flex-wrap items-end gap-px">
            {hand.closed.map((t, i) => (
              <TileFace
                key={`${t}-${i}`}
                tile={t}
                size="sm"
                selected={i === winIndex}
                mark={marked({ area: "closed", i })}
                onClick={() => removeClosed(i)}
              />
            ))}
          </div>
          {hand.melds.map((m, i) => (
            <div key={`m${i}`} className="relative ml-3 mr-1 flex items-end gap-px">
              {m.tiles.map((t, j) => (
                <TileFace
                  key={j}
                  tile={t}
                  size="sm"
                  back={!m.open && m.tiles.length === 4 && (j === 0 || j === 3)}
                  mark={marked({ area: "meld", i, j })}
                  onClick={
                    tileNumber(t) === 5 && !isHonor(t) ? () => toggleMeldAka(i, j) : undefined
                  }
                />
              ))}
              <button
                type="button"
                className="absolute -right-2 -top-2 rounded-full border border-border bg-surface p-0.5 text-muted shadow-sm hover:text-neg"
                onClick={() => update({ melds: hand.melds.filter((_, k) => k !== i) })}
                aria-label="删除副露"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {hand.closed.length === 0 && hand.melds.length === 0 && (
            <span className="px-1 text-xs text-muted">
              点击下方牌面录入，点击已录入的牌可删除
              {akaEnabled ? "；副露中的五可点击切换赤宝" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TARGET_LABELS) as Target[])
          .filter((t) => t !== "ura" || (rules.hand.uraDora && (hand.riichi || hand.doubleRiichi)))
          .map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              aria-pressed={target === t}
              className={cn(
                "h-8 rounded-md border px-2.5 text-xs",
                target === t
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-surface",
              )}
            >
              {TARGET_LABELS[t]}
            </button>
          ))}
      </div>

      <div className="grid grid-cols-9 justify-items-center gap-1" data-testid="tile-keyboard">
        {ALL_TILES.map((t) => (
          <TileFace key={t} tile={t} size="sm" dim={disabledOnKeyboard(t)} onClick={() => tap(t)} />
        ))}
        {akaEnabled && (
          <>
            <span className="col-span-2" aria-hidden />
            {AKA_TILES.map((t) => (
              <TileFace
                key={t}
                tile={t}
                size="sm"
                dim={disabledOnKeyboard(t)}
                onClick={() => tap(t)}
              />
            ))}
          </>
        )}
      </div>

      <div>
        <Label>和张</Label>
        <div className="mt-1 flex min-h-9 flex-wrap gap-1" role="group" aria-label="和张">
          {distinctClosed.map((t) => (
            <TileFace
              key={t}
              tile={t}
              size="sm"
              selected={t === hand.winTile}
              onClick={() => update({ winTile: t })}
            />
          ))}
          {distinctClosed.length === 0 && (
            <span className="text-xs text-muted">录入手牌后在此选择和张（默认最后一张）</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <Label>宝牌指示牌</Label>
          <div className="mt-1 flex min-h-9 flex-wrap gap-1">
            {hand.doraIndicators.map((t, i) => (
              <TileFace
                key={i}
                tile={t}
                size="sm"
                mark={marked({ area: "dora", i })}
                onClick={() =>
                  update({ doraIndicators: hand.doraIndicators.filter((_, k) => k !== i) })
                }
              />
            ))}
          </div>
        </div>
        <div>
          <Label>里宝指示牌</Label>
          <div className="mt-1 flex min-h-9 flex-wrap gap-1">
            {hand.uraIndicators.map((t, i) => (
              <TileFace
                key={i}
                tile={t}
                size="sm"
                mark={marked({ area: "ura", i })}
                onClick={() =>
                  update({ uraIndicators: hand.uraIndicators.filter((_, k) => k !== i) })
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <CheckRow
          checked={hand.riichi}
          onCheckedChange={(v) =>
            update({
              riichi: v,
              doubleRiichi: v ? hand.doubleRiichi : false,
              ippatsu: v ? hand.ippatsu : false,
              uraIndicators: v ? hand.uraIndicators : [],
            })
          }
        >
          立直
        </CheckRow>
        <CheckRow
          checked={hand.doubleRiichi}
          disabled={!hand.riichi}
          onCheckedChange={(v) => update({ doubleRiichi: v })}
        >
          两立直
        </CheckRow>
        {rules.hand.ippatsu && (
          <CheckRow
            checked={hand.ippatsu}
            disabled={!hand.riichi}
            onCheckedChange={(v) => update({ ippatsu: v })}
          >
            一发
          </CheckRow>
        )}
        <CheckRow checked={hand.afterKan} onCheckedChange={(v) => update({ afterKan: v })}>
          {hand.tsumo ? "岭上开花" : "抢杠"}
        </CheckRow>
        <CheckRow checked={hand.lastTile} onCheckedChange={(v) => update({ lastTile: v })}>
          {hand.tsumo ? "海底捞月" : "河底捞鱼"}
        </CheckRow>
        <CheckRow checked={hand.firstTake} onCheckedChange={(v) => update({ firstTake: v })}>
          {hand.tsumo ? "天和 / 地和" : "人和"}
        </CheckRow>
      </div>

      <div className="flex min-h-8 items-center gap-2 text-sm" aria-live="polite">
        {!complete ? (
          <span className="text-muted">录入 {capacity} 张（含和张）后自动计算番符</span>
        ) : evaluating ? (
          <span className="text-muted">计算中…</span>
        ) : evalError ? (
          <span className="text-neg">{evalError}</span>
        ) : !evaluated ? (
          <span className="text-muted">计算中…</span>
        ) : !evaluated.isAgari ? (
          <span className="text-neg">
            {evaluated.reason === "noYaku" ? "该牌型无役" : "不是和牌形"}
          </span>
        ) : evaluated.yakuman > 0 ? (
          <span className="text-lg font-semibold text-accent">
            {yakumanLabel(evaluated.yakuman)}
          </span>
        ) : (
          <span className="text-lg font-semibold">
            {evaluated.han} 番 {evaluated.fu} 符
          </span>
        )}
      </div>
      {evaluated?.isAgari && <YakuChips yaku={evaluated.yaku} yakuman={evaluated.yakuman} />}
    </div>
  );
}
