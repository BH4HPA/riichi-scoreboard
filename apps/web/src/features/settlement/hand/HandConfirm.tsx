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
 * props 只收牌与结果，不收 ValueDraft —— 取景框里没有 draft，这套签名要能被实时预览复用。
 */
export function HandConfirm({
  hand,
  rules,
  uncertain,
  riichiAuto,
  evaluated,
  evaluating,
  evalError,
  onHandChange,
  onTileClick,
  onEdit,
}: {
  hand: HandInput;
  rules: RoomRules;
  uncertain: readonly TileLoc[];
  riichiAuto: boolean;
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  evalError: string | null;
  onHandChange: (next: HandInput) => void;
  onTileClick: (loc: TileLoc) => void;
  onEdit: () => void;
}) {
  const showUra = rules.hand.uraDora && (hand.riichi || hand.doubleRiichi);
  return (
    <div className="space-y-3" data-testid="hand-confirm">
      <HandView
        hand={hand}
        size="md"
        marks={uncertain}
        onTileClick={onTileClick}
        showUra={showUra}
        keepEmptyDora
        onAddDora={onEdit}
      />
      <FlagChips
        hand={hand}
        rules={rules}
        riichiAuto={riichiAuto}
        onChange={(next: HandInput) => onHandChange(next)}
      />
      <ValueResult complete evaluated={evaluated} evaluating={evaluating} evalError={evalError} />
      <Button variant="ghost" size="sm" className="w-full" onClick={onEdit}>
        <Pencil className="mr-1 h-3.5 w-3.5" />
        改牌
      </Button>
    </div>
  );
}
