import type { GameView, UiState, YonmaRoomView } from "@riichi/core";
import { ConsoleGameShell } from "./ConsoleGameShell";
import { RoundHeader } from "@/features/scoreboard/RoundHeader";
import { PointsGrid } from "@/features/scoreboard/PointsGrid";
import { DiffMatrix } from "@/features/scoreboard/DiffMatrix";
import { HistoryTable } from "@/features/history/HistoryTable";
import { FinalPanel } from "@/features/final/FinalPanel";
import { ControlButtons } from "@/features/settlement/controls/ControlButtons";
import { ControlHost } from "@/features/settlement/controls/ControlHost";
import { useControlDialogs } from "@/features/settlement/controls/useControlDialogs";
import { MirrorOverlay } from "@/features/mirror/MirrorOverlay";

/** 四人房的主控台对局页：往壳里填记分区、历史与操作按钮。 */
export function ConsoleGame({
  room,
  game,
  names,
  intents,
  wide,
}: {
  room: YonmaRoomView;
  game: GameView;
  names: string[];
  intents: UiState[];
  wide: boolean;
}) {
  const controls = useControlDialogs();
  const finished = game.present.status === "finished";
  return (
    <>
      <ConsoleGameShell
        code={room.code}
        wide={wide}
        header={<RoundHeader game={game.present} names={names} rules={room.rules} tv={wide} />}
        aside={<HistoryTable history={game.present.history} tv />}
        history={<HistoryTable history={game.present.history} />}
        historyCount={game.present.history.length}
        panel={(close) => (
          <ControlButtons
            game={game}
            rules={room.rules}
            mySeat={null}
            size="lg"
            dissolvable
            onOpen={(key) => {
              // 同时只留一层：子对话框打开前先收起操作面板
              close();
              controls.open(key);
            }}
          />
        )}
      >
        {finished && (
          <div className="rounded-xl border border-pos/40 bg-surface p-4">
            <h2 className="mb-2 text-lg font-semibold">终局结算</h2>
            <FinalPanel
              game={game.present}
              seats={room.seats}
              names={names}
              rules={room.rules}
              tv={wide}
            />
          </div>
        )}
        <PointsGrid
          game={game.present}
          seats={room.seats}
          names={names}
          rules={room.rules}
          size={wide ? "tv" : "pad"}
        />
        <MirrorOverlay intents={intents} names={names} rules={room.rules} />
        {!finished && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <DiffMatrix
              game={game.present}
              names={names}
              rules={room.rules}
              size={wide ? "tv" : "pad"}
            />
          </div>
        )}
      </ConsoleGameShell>
      <ControlHost
        dialog={controls.dialog}
        onClose={controls.close}
        game={game.present}
        names={names}
        rules={room.rules}
        mirror={false}
        mySeat={null}
        dissolveCode={room.code}
      />
    </>
  );
}
