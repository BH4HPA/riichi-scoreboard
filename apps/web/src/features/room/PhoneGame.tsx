import { presetNameOf, seatNames, seatOfPlayer, type YonmaRoomView } from "@riichi/core";
import { useRoomStore } from "@/ws/store";
import { PhoneGameShell } from "./PhoneGameShell";
import { RoundHeader } from "@/features/scoreboard/RoundHeader";
import { PointsGrid } from "@/features/scoreboard/PointsGrid";
import { DiffMatrix } from "@/features/scoreboard/DiffMatrix";
import { MyDiffs } from "@/features/scoreboard/MyDiffs";
import { HistoryTable } from "@/features/history/HistoryTable";
import { FinalPanel } from "@/features/final/FinalPanel";
import { ControlButtons } from "@/features/settlement/controls/ControlButtons";
import { ControlHost } from "@/features/settlement/controls/ControlHost";
import { useControlDialogs } from "@/features/settlement/controls/useControlDialogs";
import { RulesEditor } from "@/features/rules/RulesEditor";

/** 四人房的手机对局页：计分卡 + 点差 + 操作栏（第一屏先看局势，操作往下翻）。 */
export function PhoneGame({ room }: { room: YonmaRoomView }) {
  const playerId = useRoomStore((s) => s.playerId);
  const controls = useControlDialogs();
  const game = room.game!;
  const names = seatNames(room);
  const mySeat = seatOfPlayer(room.seats, playerId);
  const finished = game.present.status === "finished";

  return (
    <PhoneGameShell
      code={room.code}
      rules={room.rules}
      history={<HistoryTable history={game.present.history} />}
      historyCount={game.present.history.length}
      rulesSheet={{
        description: `${presetNameOf(room.rules)} · 对局进行中，规则已锁定`,
        content: <RulesEditor value={room.rules} onChange={() => undefined} editable={false} />,
        intent: { kind: "rules" },
      }}
    >
      <RoundHeader game={game.present} names={names} rules={room.rules} />
      {finished && (
        <div className="rounded-xl border border-pos/40 bg-surface p-3">
          <h2 className="mb-1 text-base font-semibold">终局结算</h2>
          <FinalPanel
            game={game.present}
            seats={room.seats}
            names={names}
            rules={room.rules}
            compact
          />
        </div>
      )}
      <PointsGrid
        game={game.present}
        seats={room.seats}
        names={names}
        rules={room.rules}
        mySeat={mySeat}
      />
      {!finished && (
        <div className="rounded-xl border border-border bg-surface p-3">
          {mySeat !== null ? (
            <MyDiffs
              game={game.present}
              seats={room.seats}
              names={names}
              rules={room.rules}
              mySeat={mySeat}
            />
          ) : (
            <DiffMatrix game={game.present} names={names} rules={room.rules} />
          )}
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface p-3">
        <ControlButtons
          game={game}
          rules={room.rules}
          mySeat={mySeat}
          size="md"
          onOpen={controls.open}
        />
      </div>
      <ControlHost
        dialog={controls.dialog}
        onClose={controls.close}
        game={game.present}
        names={names}
        rules={room.rules}
        mirror
        mySeat={mySeat}
      />
    </PhoneGameShell>
  );
}
