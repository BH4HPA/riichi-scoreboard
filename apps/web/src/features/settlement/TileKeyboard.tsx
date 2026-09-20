import { useState } from "react";
import { X } from "lucide-react";
import {
  akaOf,
  baseTile,
  isAka,
  isHonor,
  tileNumber,
  type EvaluatedHand,
  type HandInput,
  type Meld,
  type RoomRules,
  type Tile,
} from "@riichi/core";
import { CheckRow, Label } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { isAnkanBack } from "@/features/hand/meld";
import { TileFace } from "@/features/hand/TileFace";
import { TileGrid } from "@/features/hand/TileGrid";
import { hasLoc, type TileLoc } from "@/features/hand/tileLoc";
import { akaAvailable, countTile } from "./hand/quota";
import { firstTakeLabel } from "./hand/firstTake";
import { withRiichi } from "./hand/handEdits";
import { ValueResult } from "./hand/ValueResult";
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

/** 键盘牌键的点击区撑满整格（约 36×44），牌图保持原尺寸居中：单手录入不用对准 26px 宽的牌 */
const KEY_HIT = "min-h-11 w-full items-center justify-center";

export function TileKeyboard({
  hand,
  onChange,
  rules,
  evaluated,
  evaluating,
  evalError,
  uncertain = [],
  showValue = true,
  isDealer,
  riichiLocked,
}: {
  hand: HandInput;
  onChange: (next: HandInput) => void;
  rules: RoomRules;
  /** 和牌者是否庄家：决定第一巡自摸叫天和还是地和 */
  isDealer: boolean;
  /** 由 ValuePicker 在手牌录满后自动评估 */
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  evalError: string | null;
  /** 识别没把握的位置，给对应的牌打记号 */
  uncertain?: readonly TileLoc[];
  /** 算点数页核对阶段不算番，不显示番符与役种 */
  showValue?: boolean;
  /** 立直开关被锁定时的原因文案；不传 = 可自由勾选 */
  riichiLocked?: string | undefined;
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
    if (isAnkanBack(meld, tileIndex)) return;
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
              {m.tiles.map((t, j) => {
                const back = isAnkanBack(m, j);
                return (
                  <TileFace
                    key={j}
                    tile={t}
                    size="sm"
                    back={back}
                    mark={!back && marked({ area: "meld", i, j })}
                    onClick={
                      !back && tileNumber(t) === 5 && !isHonor(t)
                        ? () => toggleMeldAka(i, j)
                        : undefined
                    }
                  />
                );
              })}
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

      <TileGrid
        aka={akaEnabled}
        disabled={disabledOnKeyboard}
        onPick={tap}
        buttonClassName={KEY_HIT}
        testId="tile-keyboard"
      />

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
          disabled={riichiLocked !== undefined}
          onCheckedChange={(v) => onChange(withRiichi(hand, v))}
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
          {firstTakeLabel(hand.tsumo, isDealer)}
        </CheckRow>
      </div>

      {riichiLocked !== undefined && <p className="text-xs text-muted">{riichiLocked}</p>}

      {showValue && (
        <ValueResult
          complete={complete}
          evaluated={evaluated}
          evaluating={evaluating}
          evalError={evalError}
          hint={`录入 ${capacity} 张（含和张）后自动计算番符`}
        />
      )}
    </div>
  );
}
