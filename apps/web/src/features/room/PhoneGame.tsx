import { useState } from "react";
import { Link } from "react-router";
import { BookOpen, History, ScrollText, User } from "lucide-react";
import {
  DEFAULT_REFERENCE_VIEW,
  presetNameOf,
  seatNames,
  seatOfPlayer,
  type ReferenceView,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { ConnectionBadge } from "@/ui/notice";
import { useRoomStore } from "@/ws/store";
import { RoundHeader } from "@/features/scoreboard/RoundHeader";
import { PointsGrid } from "@/features/scoreboard/PointsGrid";
import { DiffMatrix } from "@/features/scoreboard/DiffMatrix";
import { HistoryList } from "@/features/history/HistoryTable";
import { FinalPanel } from "@/features/final/FinalPanel";
import { ControlButtons } from "@/features/settlement/controls/ControlButtons";
import { ControlHost } from "@/features/settlement/controls/ControlHost";
import { useControlDialogs } from "@/features/settlement/controls/useControlDialogs";
import { ReferenceSheet } from "@/features/reference/ReferenceSheet";
import { RulesEditor } from "@/features/rules/RulesEditor";
import { ProfileEditor, StatsPanel } from "@/features/profile/ProfileEditor";
import { useMirror } from "@/features/settlement/useMirror";
import { ICP } from "@/features/site/site";

type Sheet = "reference" | "rules" | "history" | "me" | null;

const NAV: Array<[Exclude<Sheet, null>, typeof History, string]> = [
  ["history", History, "记录"],
  ["reference", BookOpen, "番符表"],
  ["rules", ScrollText, "规则"],
  ["me", User, "我的"],
];

/** 手机对局页：计分卡 + 操作栏 + 点差，底部工具栏打开记录/番符表/规则/我的。 */
export function PhoneGame() {
  const room = useRoomStore((s) => s.room)!;
  const playerId = useRoomStore((s) => s.playerId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [refView, setRefView] = useState<ReferenceView>(DEFAULT_REFERENCE_VIEW);
  const controls = useControlDialogs();
  useMirror(sheet === "reference", { kind: "reference", ...refView }, true);
  useMirror(sheet === "rules", { kind: "rules" }, true);
  const game = room.game!;
  const names = seatNames(room);
  const mySeat = seatOfPlayer(room.seats, playerId);
  const closeSheet = (open: boolean) => !open && setSheet(null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28 pt-4">
      <RoundHeader game={game.present} names={names} rules={room.rules} />
      <PointsGrid
        game={game.present}
        seats={room.seats}
        names={names}
        rules={room.rules}
        highlightSeat={mySeat}
      />
      {game.present.status === "finished" && (
        <div className="rounded-xl border border-pos/40 bg-surface p-3">
          <h2 className="mb-1 text-base font-semibold">终局结算</h2>
          <FinalPanel game={game.present} seats={room.seats} names={names} rules={room.rules} />
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface p-3">
        <ControlButtons
          game={game}
          rules={room.rules}
          mySeat={mySeat}
          size="sm"
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
      <div className="rounded-xl border border-border bg-surface p-3">
        <DiffMatrix game={game.present} names={names} rules={room.rules} />
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
        aria-label="功能"
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-4 pt-1.5 text-[11px] text-muted">
          <span>
            房间 <span className="font-semibold tabular text-fg">{room.code}</span>
          </span>
          <span className="ml-auto mr-3 truncate">{ICP.number}</span>
          <ConnectionBadge />
        </div>
        <div className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSheet(key)}
              aria-pressed={sheet === key}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted hover:text-fg aria-pressed:text-fg"
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <Dialog open={sheet === "history"} onOpenChange={closeSheet}>
        <DialogContent title="历史记录" description={`共 ${game.present.history.length} 条`}>
          <HistoryList history={game.present.history} />
        </DialogContent>
      </Dialog>
      <Dialog open={sheet === "reference"} onOpenChange={closeSheet}>
        <DialogContent
          title="番符表"
          description="打开时电视会同步显示"
          className="h-[92dvh] sm:max-w-2xl"
        >
          <ReferenceSheet rules={room.rules} view={refView} onViewChange={setRefView} />
        </DialogContent>
      </Dialog>
      <Dialog open={sheet === "rules"} onOpenChange={closeSheet}>
        <DialogContent
          title="房间规则"
          description={`${presetNameOf(room.rules)} · 对局进行中，规则已锁定`}
        >
          <RulesEditor value={room.rules} onChange={() => undefined} editable={false} />
        </DialogContent>
      </Dialog>
      <Dialog open={sheet === "me"} onOpenChange={closeSheet}>
        <DialogContent title="我的" description="昵称与头像会同步到房间">
          <ProfileEditor />
          <h3 className="mb-2 mt-4 text-sm font-medium">战绩</h3>
          <StatsPanel />
          <Button asChild variant="ghost" size="sm" className="mt-4 w-full text-muted">
            <Link to="/">退出房间（座位保留，回来扫码即恢复）</Link>
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
