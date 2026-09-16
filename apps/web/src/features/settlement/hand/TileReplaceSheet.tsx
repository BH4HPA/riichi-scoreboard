import {
  AKA_TILES,
  ALL_TILES,
  akaLimit,
  allHandTiles,
  baseTile,
  isAka,
  sameTile,
  tileSuit,
  type HandInput,
  type RoomRules,
  type Tile,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { TileFace } from "@/features/hand/TileFace";
import { tileLabel } from "@/features/hand/tileLabel";
import type { TileLoc } from "@/features/hand/tileLoc";
import { tileAt } from "./handEdits";

/** 同一基础牌（忽略赤标记）除了 loc 这一张之外已录入几张。 */
function countOthers(hand: HandInput, loc: TileLoc, tile: Tile): number {
  const current = tileAt(hand, loc);
  const n = allHandTiles(hand).filter((t) => sameTile(t, tile)).length;
  return current !== null && sameTile(current, tile) ? n - 1 : n;
}

function akaAvailable(hand: HandInput, loc: TileLoc, tile: Tile, rules: RoomRules): boolean {
  if (!isAka(tile)) return true;
  const current = tileAt(hand, loc);
  const others = allHandTiles(hand).filter((t) => isAka(t) && t !== current);
  if (others.length >= rules.hand.akaCount) return false;
  const suit = tileSuit(tile) as "m" | "p" | "s";
  return others.filter((t) => tileSuit(t) === suit).length < akaLimit(suit, rules.hand.akaCount);
}

/**
 * 确认态点一张牌之后弹出来的替换面板。
 * 语义是「把这个位置换成另一张」而不是删除 —— 张数已经对了，删一张就不完整了。
 * 顶部另给「设为和张」：识别最常猜错的两件事就是和张位置（没横放 / 多张横放），
 * 而确认态把和张选择区收起来了，没有这条就只能退回键盘。
 */
export function TileReplaceSheet({
  hand,
  loc,
  rules,
  onReplace,
  onSetWinTile,
  onClose,
}: {
  hand: HandInput;
  loc: TileLoc | null;
  rules: RoomRules;
  onReplace: (loc: TileLoc, tile: Tile) => void;
  onSetWinTile: (loc: TileLoc) => void;
  onClose: () => void;
}) {
  const current = loc ? tileAt(hand, loc) : null;
  const isMeld = loc?.area === "meld";
  const meld = isMeld ? hand.melds[loc.i] : undefined;
  const canSetWin =
    loc?.area === "closed" && current !== null && hand.closed[loc.i] !== hand.winTile;

  const disabled = (t: Tile): boolean => {
    if (!loc) return true;
    if (countOthers(hand, loc, t) >= 4) return true;
    if (!akaAvailable(hand, loc, t, rules)) return true;
    // 副露里只允许改牌的身份，不允许改出别的牌型（吃碰杠的组成由键盘那边管）
    if (meld && baseTile(t) !== baseTile(meld.tiles[loc.j ?? 0]!)) return true;
    return false;
  };

  return (
    <Dialog open={loc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={current === null ? "选一张牌" : `换掉 ${tileLabel(current)}`}
        description={
          isMeld ? "副露里只能改赤宝标记；要改牌型请用下面的全键盘" : "点一张牌替换这个位置"
        }
      >
        {canSetWin && loc && (
          <Button variant="outline" className="w-full" onClick={() => onSetWinTile(loc)}>
            把这张设为和张
          </Button>
        )}
        <div
          className="mt-3 grid grid-cols-9 justify-items-center gap-1"
          data-testid="replace-grid"
        >
          {ALL_TILES.map((t) => (
            <TileFace
              key={t}
              tile={t}
              size="sm"
              selected={current !== null && t === current}
              dim={disabled(t)}
              onClick={() => loc && onReplace(loc, t)}
            />
          ))}
          {rules.hand.akaCount > 0 && (
            <>
              <span className="col-span-2" aria-hidden />
              {AKA_TILES.map((t) => (
                <TileFace
                  key={t}
                  tile={t}
                  size="sm"
                  selected={current !== null && t === current}
                  dim={disabled(t)}
                  onClick={() => loc && onReplace(loc, t)}
                />
              ))}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
