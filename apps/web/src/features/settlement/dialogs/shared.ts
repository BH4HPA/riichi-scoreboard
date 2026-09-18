import { dealerOf, roundLabel, type GameState, type RoomRules, type Seat } from "@riichi/core";

/** 结算类对话框的公共入参；mySeat 是操作者座位（默认选人与相对方位的视角），主控台为 null。 */
export interface SettlementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  mySeat: Seat | null;
}

export type SettlementFormProps = Omit<SettlementDialogProps, "open" | "onOpenChange"> & {
  onDone: () => void;
};

export function roundDescription(game: GameState, names: string[]): string {
  return `${roundLabel(game.kyoku, game.honba)}，庄家：${names[dealerOf(game.kyoku)]}`;
}
