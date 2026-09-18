import { baseTile, type HandInput, type RoomRules, type Tile } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { TileGrid } from "@/features/hand/TileGrid";
import { tileLabel } from "@/features/hand/tileLabel";
import type { TileLoc } from "@/features/hand/tileLoc";
import { tileAt } from "./handEdits";
import { akaAvailable, countTile } from "./quota";

/**
 * 确认态点一张牌之后弹出来的替换面板：语义是「把这个位置换成另一张」而不是删除（见 replaceAt）。
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
    if (countTile(hand, t, loc) >= 4) return true;
    if (!akaAvailable(hand, t, rules, loc)) return true;
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
        <TileGrid
          aka={rules.hand.akaCount > 0}
          disabled={disabled}
          selected={(t) => current !== null && t === current}
          onPick={(t) => loc && onReplace(loc, t)}
          className="mt-3 grid grid-cols-9 justify-items-center gap-1"
          testId="replace-grid"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
