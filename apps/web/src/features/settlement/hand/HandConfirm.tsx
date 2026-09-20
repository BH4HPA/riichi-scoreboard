import { Pencil } from "lucide-react";
import type { EvaluatedHand, HandInput, RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { HandView } from "@/features/hand/HandView";
import type { TileLoc } from "@/features/hand/tileLoc";
import { FlagChips } from "./FlagChips";
import { ValueResult } from "./ValueResult";

/**
 * 识别通过时的结算界面：像主控台一样把牌摆出来，键盘收起。
 * 没把握的那张牌自己带记号，点任意一张就能换或者改和张；旗标压成一行常驻 chips。
 */
export function HandConfirm({
  hand,
  rules,
  uncertain,
  riichiAuto,
  isDealer,
  riichiLocked = false,
  evaluated,
  evaluating,
  evalError,
  showValue = true,
  onHandChange,
  onTileClick,
  onEdit,
}: {
  hand: HandInput;
  rules: RoomRules;
  uncertain: readonly TileLoc[];
  riichiAuto: boolean;
  /** 和牌者是否庄家：决定第一巡自摸叫天和还是地和 */
  isDealer: boolean;
  /** 立直开关被锁定 */
  riichiLocked?: boolean;
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  evalError: string | null;
  showValue?: boolean;
  onHandChange: (next: HandInput) => void;
  onTileClick: (loc: TileLoc) => void;
  onEdit: () => void;
}) {
  const showUra = rules.hand.uraDora && (hand.riichi || hand.doubleRiichi);
  return (
    <div className="space-y-3" data-testid="hand-confirm">
      <HandView
        hand={hand}
        // 手机宽度放不下 14 张大牌：与编辑态同尺寸，横滑只剩一点点
        size="sm"
        marks={uncertain}
        onTileClick={onTileClick}
        showUra={showUra}
        scroll
        keepEmptyDora
        onAddDora={onEdit}
      />
      <FlagChips
        hand={hand}
        rules={rules}
        riichiAuto={riichiAuto}
        isDealer={isDealer}
        riichiLocked={riichiLocked}
        onChange={(next: HandInput) => onHandChange(next)}
      />
      {showValue && (
        <ValueResult complete evaluated={evaluated} evaluating={evaluating} evalError={evalError} />
      )}
      <Button variant="ghost" size="sm" className="w-full" onClick={onEdit}>
        <Pencil className="mr-1 h-3.5 w-3.5" />
        改牌
      </Button>
    </div>
  );
}
