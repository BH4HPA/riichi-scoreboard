import { useState } from "react";
import { Calculator, Trash2 } from "lucide-react";
import {
  ALL_TILES,
  isHonor,
  yakuName,
  tileNumber,
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
import { TileFace } from "./TileFace";
import { tileLabel } from "./format";

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

function countTile(hand: HandInput, tile: Tile): number {
  return (
    hand.closed.filter((t) => t === tile).length +
    hand.melds.flatMap((m) => m.tiles).filter((t) => t === tile).length
  );
}

function closedCapacity(hand: HandInput): number {
  return 14 - hand.melds.length * 3;
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

  const update = (patch: Partial<HandInput>) => onChange({ ...hand, ...patch });

  const addMeld = (meld: Meld) => {
    const next = { ...hand, melds: [...hand.melds, meld] };
    const cap = closedCapacity(next);
    next.closed = next.closed.slice(0, cap);
    onChange(next);
    setTarget("closed");
  };

  const tap = (tile: Tile) => {
    switch (target) {
      case "closed": {
        if (hand.closed.length >= capacity || countTile(hand, tile) >= 4) return;
        update({ closed: [...hand.closed, tile], winTile: tile });
        return;
      }
      case "dora":
        if (hand.doraIndicators.length < (rules.hand.kanDora ? 5 : 1))
          update({ doraIndicators: [...hand.doraIndicators, tile] });
        return;
      case "ura":
        if (hand.uraIndicators.length < hand.doraIndicators.length)
          update({ uraIndicators: [...hand.uraIndicators, tile] });
        return;
      case "chi": {
        if (isHonor(tile) || tileNumber(tile) > 7) return;
        addMeld({ open: true, tiles: [tile, tile + 1, tile + 2] });
        return;
      }
      case "pon":
        if (countTile(hand, tile) > 1) return;
        addMeld({ open: true, tiles: [tile, tile, tile] });
        return;
      case "kan":
      case "ankan":
        if (countTile(hand, tile) > 0) return;
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

  const distinctClosed = [...new Set(hand.closed)];

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
        <div className="mt-1 flex min-h-12 flex-wrap items-center gap-1 rounded-lg border border-dashed border-border p-1.5">
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
              className="ml-1 inline-flex items-center gap-0.5 rounded-md bg-surface-2 p-1"
            >
              {m.tiles.map((t, j) => (
                <TileFace key={j} tile={t} size="sm" dim={!m.open && (j === 0 || j === 3)} />
              ))}
              <button
                type="button"
                className="ml-0.5 p-0.5 text-muted hover:text-neg"
                onClick={() => update({ melds: hand.melds.filter((_, k) => k !== i) })}
                aria-label="删除副露"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {hand.closed.length === 0 && hand.melds.length === 0 && (
            <span className="px-1 text-xs text-muted">点击下方牌面录入，点击已录入的牌可删除</span>
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

      <div className="grid grid-cols-9 gap-1">
        {ALL_TILES.map((t) => (
          <TileFace
            key={t}
            tile={t}
            size="sm"
            dim={countTile(hand, t) >= 4}
            onClick={() => tap(t)}
            className="w-full"
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>和张</Label>
          <ChipGroup
            value={hand.winTile || null}
            onChange={(t) => update({ winTile: t })}
            options={distinctClosed.map((t) => ({ value: t, label: tileLabel(t) }))}
            className="mt-1"
          />
        </div>
        <div>
          <Label>赤宝牌</Label>
          <ChipGroup
            value={hand.aka}
            onChange={(n) => update({ aka: n })}
            options={Array.from({ length: rules.hand.akaCount + 1 }, (_, i) => ({
              value: i,
              label: i,
            }))}
            className="mt-1"
          />
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
              <span className="text-neg">不是和牌形或无役</span>
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
      {evaluated?.isAgari && (
        <div className="flex flex-wrap gap-1 text-xs">
          {Object.entries(evaluated.yaku).map(([id, han]) => (
            <span key={id} className="rounded-md bg-surface-2 px-1.5 py-0.5">
              {yakuName(id)} {evaluated.yakuman > 0 ? "" : `${han} 番`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
