import { seatNames, type TenGameView, type TenRoomView, type UiState } from "@riichi/core";
import { ConsoleGameShell } from "@/features/console/ConsoleGameShell";
import { useTimeMarkNotice } from "./clock/useTimeMarkNotice";
import { TenFinalPanel } from "./final/TenFinalPanel";
import { TenHistoryTable } from "./history/TenHistoryTable";
import { TenMirrorOverlay } from "./mirror/TenMirrorOverlay";
import { TenHeader } from "./scoreboard/TenHeader";
import { TenScoreGrid } from "./scoreboard/TenScoreGrid";
import { TenStageHint } from "./scoreboard/TenStageHint";
import { TenControlButtons } from "./settlement/TenControlButtons";
import { TenControlHost } from "./settlement/TenControlHost";
import { useTenDialogs } from "./settlement/useTenDialogs";
import { canPickFor } from "./stageB/canPick";
import { GuessBoard } from "./stageB/GuessBoard";

/**
 * 二人房的主控台对局页。Stage B 时宽屏右栏从历史换成全牌型板（结算后自动换回）；
 * 窄屏没有右栏，全牌型板放在得分卡下面。主控台能否替防守方指定见 `canPickFor`。
 */
export function TenConsoleGame({
  room,
  game,
  intents,
  wide,
}: {
  room: TenRoomView;
  game: TenGameView;
  intents: UiState[];
  wide: boolean;
}) {
  const controls = useTenDialogs();
  const names = seatNames(room);
  const { present } = game;
  const finished = present.status === "finished";
  const stageB = !finished && present.stage.kind === "B" ? present.stage : null;
  const pickable = stageB !== null && canPickFor(stageB, room.seats, null);
  useTimeMarkNotice(room.timeMark);

  return (
    <>
      <ConsoleGameShell
        code={room.code}
        wide={wide}
        header={<TenHeader game={present} names={names} timeMark={room.timeMark} tv={wide} />}
        aside={
          stageB ? (
            <GuessBoard stage={stageB} entries={present.history.length} pickable={pickable} tv />
          ) : (
            <TenHistoryTable history={present.history} tv />
          )
        }
        history={<TenHistoryTable history={present.history} />}
        historyCount={present.history.length}
        panel={(close) => (
          <TenControlButtons
            game={game}
            seats={room.seats}
            names={names}
            mySeat={null}
            size="lg"
            dissolvable
            onOpen={(key) => {
              close();
              controls.open(key);
            }}
          />
        )}
      >
        {finished && (
          <div className="rounded-xl border border-pos/40 bg-surface p-4">
            <h2 className="mb-2 text-lg font-semibold">终局</h2>
            <TenFinalPanel game={present} names={names} tv={wide} />
          </div>
        )}
        <TenScoreGrid game={present} seats={room.seats} names={names} size={wide ? "tv" : "pad"} />
        <TenMirrorOverlay intents={intents} names={names} rules={room.rules} />
        {!finished && <TenStageHint stage={present.stage} tv={wide} />}
        {stageB && !wide && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <GuessBoard stage={stageB} entries={present.history.length} pickable={pickable} tv />
          </div>
        )}
      </ConsoleGameShell>
      <TenControlHost
        dialog={controls.dialog}
        onClose={controls.close}
        gameNo={room.gameNo}
        game={present}
        names={names}
        rules={room.rules}
        mirror={false}
        dissolveCode={room.code}
      />
    </>
  );
}
