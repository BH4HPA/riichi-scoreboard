import { useState } from "react";
import { Calculator, Trash2 } from "lucide-react";
import {
  AKA_TILES,
  ALL_TILES,
  akaLimit,
  akaOf,
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
import { Button } from "@/ui/button";
import { CheckRow, ChipGroup, Label } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { TileFace } from "@/features/hand/TileFace";
import { YakuChips } from "@/features/hand/HandStrip";
import { tileLabel } from "@/features/hand/tileLabel";

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

function allTiles(hand: HandInput): Tile[] {
  return [...hand.closed, ...hand.melds.flatMap((m) => m.tiles)];
}

/** 同一基础牌（忽略赤标记）已录入张数。 */
function countTile(hand: HandInput, tile: Tile): number {
  return allTiles(hand).filter((t) => sameTile(t, tile)).length;
}

function closedCapacity(hand: HandInput): number {
  return 14 - hand.melds.length * 3;
}

/** 该赤五是否还能再录入：受规则总数与同花色上限约束。 */
function akaAvailable(hand: HandInput, tile: Tile, rules: RoomRules): boolean {
  if (!isAka(tile)) return true;
  const all = allTiles(hand);
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
  onEvaluate,
}: {
  hand: HandInput;
  onChange: (next: HandInput) => void;
  rules: RoomRules;
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  onEvaluate: () => void;
}) {
  const [target, setTarget] = useState<Target>("closed");
  const capacity = closedCapacity(hand);
  const complete = hand.closed.length === capacity;
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
  const keys: Tile[] = akaEnabled ? [...ALL_TILES, ...AKA_TILES] : [...ALL_TILES];

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
          className="mt-1 flex min-h-12 flex-wrap items-end gap-1 rounded-lg border border-dashed border-border p-1.5"
          data-testid="hand-area"
        >
          {hand.closed.map((t, i) => (
            <TileFace
              key={`${t}-${i}`}
              tile={t}
              size="sm"
              selected={t === hand.winTile}
              onClick={() => removeClosed(i)}
            />
          ))}
          {hand.melds.map((m, i) => (
            <span
              key={`m${i}`}
              className="ml-1 inline-flex items-end gap-0.5 rounded-md bg-surface-2 p-1"
            >
              {m.tiles.map((t, j) => (
                <TileFace
                  key={j}
                  tile={t}
                  size="sm"
                  back={!m.open && m.tiles.length === 4 && (j === 0 || j === 3)}
                  onClick={
                    tileNumber(t) === 5 && !isHonor(t) ? () => toggleMeldAka(i, j) : undefined
                  }
                />
              ))}
              <button
                type="button"
                className="ml-0.5 self-center p-0.5 text-muted hover:text-neg"
                onClick={() => update({ melds: hand.melds.filter((_, k) => k !== i) })}
                aria-label="删除副露"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
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
        {keys.map((t) => (
          <TileFace key={t} tile={t} size="sm" dim={disabledOnKeyboard(t)} onClick={() => tap(t)} />
        ))}
      </div>

      <div>
        <Label>和张</Label>
        <ChipGroup
          value={hand.winTile || null}
          onChange={(t) => update({ winTile: t })}
          options={distinctClosed.map((t) => ({ value: t, label: tileLabel(t) }))}
          className="mt-1"
        />
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

      <div className="flex items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          onClick={onEvaluate}
          disabled={!complete || !hand.winTile || evaluating}
        >
          <Calculator className="h-4 w-4" /> {evaluating ? "计算中…" : "计算番符"}
        </Button>
        {evaluated && (
          <span className="text-sm">
            {!evaluated.isAgari ? (
              <span className="text-neg">
                {evaluated.reason === "noYaku" ? "该牌型无役" : "不是和牌形"}
              </span>
            ) : evaluated.yakuman > 0 ? (
              <span className="font-semibold text-accent">{yakumanLabel(evaluated.yakuman)}</span>
            ) : (
              <span className="font-semibold">
                {evaluated.han} 番 {evaluated.fu} 符
              </span>
            )}
          </span>
        )}
      </div>
      {evaluated?.isAgari && <YakuChips yaku={evaluated.yaku} yakuman={evaluated.yakuman} />}
    </div>
  );
}
