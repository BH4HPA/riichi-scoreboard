import { canRiichi, type GameState, type RoomRules, type Seat } from "@riichi/core";
import { useCommand } from "@/ws/useRoom";
import { RiichiMusicRow } from "./RiichiMusicRow";

/**
 * 操作栏「对局中」一节：选曲 + 「▶ 立直」。在座的手机按下 = 声明本局立直（结算表单据此预勾）+ 电视放曲；
 * 主控台（无座位）代按只放曲。点数不足且规则不允许立直时禁用。下方一行显示谁在放哪首。
 */
export function RiichiSection({
  game,
  rules,
  mySeat,
  size,
}: {
  game: GameState;
  rules: RoomRules;
  mySeat: Seat | null;
  size: "sm" | "md" | "lg";
}) {
  const send = useCommand();
  const blocked =
    game.status === "finished" || (mySeat !== null && !canRiichi(game, rules, mySeat));
  // 记分优先：在座的声明立直不依赖选曲
  const declare = () => {
    if (mySeat === null || game.riichi[mySeat]) return;
    void send({
      type: "declareRiichi",
      seat: mySeat,
      kyoku: game.kyoku,
      honba: game.honba,
      entries: game.history.length,
    });
  };

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-muted">对局中</h3>
      <RiichiMusicRow
        size={size}
        blocked={blocked}
        needsTrack={mySeat === null}
        onPress={declare}
      />
    </section>
  );
}
