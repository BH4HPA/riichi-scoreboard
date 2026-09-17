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
  isDealer,
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
        // 手机宽度放不下 14 张大牌：用与编辑态一致的尺寸，横滑只剩一点点，和张基本一眼可见。
        // 「像主控台一样」指的是只读成排展示，不是牌得一样大——电视有 1600px，手机没有。
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
