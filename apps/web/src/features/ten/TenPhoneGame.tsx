import { useState } from "react";
import { seatNames, seatOfPlayer, TEN_GUIDE_FIRST, type TenRoomView } from "@riichi/core";
import { useRoomStore } from "@/ws/store";
import { PhoneGameShell } from "@/features/room/PhoneGameShell";
import { RulesEditor } from "@/features/rules/RulesEditor";
import { useTimeMarkNotice } from "./clock/useTimeMarkNotice";
import { TenFinalPanel } from "./final/TenFinalPanel";
import { TenGuide } from "./guide/TenGuide";
import { TenHistoryTable } from "./history/TenHistoryTable";
import { TEN_RULE_GROUPS } from "./rules";
import { TenHeader } from "./scoreboard/TenHeader";
import { TenScoreGrid } from "./scoreboard/TenScoreGrid";
import { TenControlButtons } from "./settlement/TenControlButtons";
import { TenControlHost } from "./settlement/TenControlHost";
import { useTenDialogs } from "./settlement/useTenDialogs";
import { canPickFor } from "./stageB/canPick";
import { GuessBoard } from "./stageB/GuessBoard";

/**
 * 二人房的手机对局页：得分卡 → Stage B 的全牌型板（谁可以指定见 `canPickFor`）→ 操作栏。
 * 底部「规则」页先放规则说明（可投到电视），再放只读的房间规则。
 */
export function TenPhoneGame({ room }: { room: TenRoomView }) {
  const playerId = useRoomStore((s) => s.playerId);
  const controls = useTenDialogs();
  const [guidePage, setGuidePage] = useState(TEN_GUIDE_FIRST);
  const game = room.game!;
  const { present } = game;
  const names = seatNames(room);
  const mySeat = seatOfPlayer(room.seats, playerId);
  const finished = present.status === "finished";
  const stageB = !finished && present.stage.kind === "B" ? present.stage : null;
  useTimeMarkNotice(room.timeMark);

  return (
    <PhoneGameShell
      code={room.code}
      rules={room.rules}
      history={<TenHistoryTable history={present.history} />}
      historyCount={present.history.length}
      rulesSheet={{
        description: "《天》二人麻将 · 对局进行中，规则已锁定",
        content: (
          <div className="space-y-5">
            <TenGuide page={guidePage} onPageChange={setGuidePage} />
            <RulesEditor
              value={room.rules}
              onChange={() => undefined}
              editable={false}
              groups={TEN_RULE_GROUPS}
            />
          </div>
        ),
        intent: { kind: "tenGuide", page: guidePage },
      }}
    >
      <TenHeader game={present} names={names} timeMark={room.timeMark} />
      {finished && (
        <div className="rounded-xl border border-pos/40 bg-surface p-3">
          <h2 className="mb-1 text-base font-semibold">终局</h2>
          <TenFinalPanel game={present} names={names} />
        </div>
      )}
      <TenScoreGrid game={present} seats={room.seats} names={names} mySeat={mySeat} />
      {stageB && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <GuessBoard
            stage={stageB}
            entries={present.history.length}
            pickable={canPickFor(stageB, room.seats, mySeat)}
          />
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface p-3">
        <TenControlButtons
          game={game}
          seats={room.seats}
          names={names}
          mySeat={mySeat}
          size="md"
          onOpen={controls.open}
        />
      </div>
      <TenControlHost
        dialog={controls.dialog}
        onClose={controls.close}
        gameNo={room.gameNo}
        game={present}
        names={names}
        rules={room.rules}
        mirror
      />
    </PhoneGameShell>
  );
}
