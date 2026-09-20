import { isLocalPlayer, type PlayerRef, type Seat, type TenGameState } from "@riichi/core";
import { Button } from "@/ui/button";
import { useCommand } from "@/ws/useRoom";
import { RiichiMusicRow } from "@/features/music/RiichiMusicRow";

/**
 * Stage A 的「宣言」一节：听牌的一方按「▶ 立直」（扣 1 根立直棒 + 电视放曲）或「听牌宣言」，进入 Stage B。
 * 在座的手机替自己宣言；主控台（无座位）替本地玩家宣言，每个本地玩家一排。设备玩家的宣言只能本人按。
 */
export function TenDeclareSection({
  game,
  seats,
  names,
  mySeat,
  size,
}: {
  game: TenGameState;
  seats: (PlayerRef | null)[];
  names: string[];
  mySeat: Seat | null;
  size: "sm" | "md" | "lg";
}) {
  const send = useCommand();
  const declare = (seat: Seat, riichi: boolean) =>
    void send({ type: "tenDeclare", seat, riichi, entries: game.history.length });
  const mine: Seat[] =
    mySeat !== null
      ? [mySeat]
      : seats.flatMap((p, seat) => (isLocalPlayer(p) ? [seat as Seat] : []));

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-muted">Stage A · 听牌了就宣言</h3>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">由听牌的一方在自己的手机上宣言。</p>
      ) : (
        <div className="space-y-2">
          {mine.map((seat) => {
            const sticks = game.sticks[seat]!;
            return (
              <div key={seat} data-testid={`declare-${seat}`}>
                {mySeat === null && <div className="mb-1 text-xs text-muted">{names[seat]}</div>}
                <RiichiMusicRow
                  size={size}
                  blocked={sticks <= 0}
                  needsTrack={false}
                  onPress={() => declare(seat, true)}
                >
                  <Button size={size} variant="outline" onClick={() => declare(seat, false)}>
                    听牌宣言
                  </Button>
                </RiichiMusicRow>
                <p className="mt-1 text-xs text-muted">
                  {sticks > 0
                    ? `立直用掉 1 根立直棒（还剩 ${sticks} 根），多一番并可算一发、里宝。`
                    : "立直棒已用完，只能听牌宣言。"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
