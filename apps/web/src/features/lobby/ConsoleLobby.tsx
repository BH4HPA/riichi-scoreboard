import { useState, type ReactNode } from "react";
import { BookOpen, Play, Settings2, Users } from "lucide-react";
import {
  presetNameOf,
  seatLabels,
  seatNames,
  type RoomView,
  type Seat,
  type UiState,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { useCommand } from "@/ws/useRoom";
import { cn } from "@/lib/utils";
import { RoomQr, RoomQrDialog } from "@/features/console/RoomQr";
import { RulesDialog } from "@/features/rules/RulesDialog";
import { RulesEditor } from "@/features/rules/RulesEditor";
import { SiteBrand, SiteFooter } from "@/features/site/SiteFooter";
import { TenGuideDialog } from "@/features/ten/guide/TenGuideDialog";
import { TenGuideMirror } from "@/features/ten/guide/TenGuideMirror";
import { TEN_RULE_GROUPS } from "@/features/ten/rules";
import { LocalPlayerDialog } from "./LocalPlayerDialog";
import { SeatCards } from "./SeatCards";
import { startBlocker } from "./startBlocker";
import { useCountdown } from "./useCountdown";

/**
 * 主控台大厅。宽屏：左栏二维码、右栏座位 + 规则；
 * 窄屏（Pad）：单栏，二维码放弹窗（首次进入自动弹出一次）。
 */
export function ConsoleLobby({
  room,
  intents,
  wide,
  extraActions,
}: {
  room: RoomView;
  /** 手机端正在投屏的内容：大厅里只有二人房的规则说明会投上来 */
  intents: UiState[];
  wide: boolean;
  /** 放在底部操作栏右侧的额外按钮（如解散房间） */
  extraActions?: ReactNode;
}) {
  const send = useCommand();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const ten = room.kind === "ten";
  const labels = seatLabels(room.kind);
  const ruleGroups = ten ? TEN_RULE_GROUPS : undefined;
  const [localSeat, setLocalSeat] = useState<Seat | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  // 窄屏首次进入大厅自动展示二维码；房间码变了再弹一次
  const [qrShownFor, setQrShownFor] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  if (!wide && qrShownFor !== room.code) {
    setQrShownFor(room.code);
    setQrOpen(true);
  }
  const full = room.seats.every((s) => s !== null);
  const allReady = full && room.ready.every(Boolean);
  const blocker = startBlocker(room);
  const countdown = useCountdown(useRoomStore((s) => s.autoStartDeadline));
  const openLocals = (seat: Seat | null) => {
    setLocalSeat(seat);
    setLocalOpen(true);
  };

  const seats = (
    <SeatCards
      seats={room.seats}
      labels={labels}
      ready={room.ready}
      online={room.online}
      mySeat={null}
      onAddLocal={openLocals}
      onLeave={(seat) => send({ type: "leave", seat })}
      tv={wide}
    />
  );
  const rulesCard = (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          房间规则
          <Badge tone="outline">{presetNameOf(room.rules)}</Badge>
        </h2>
        <span className="flex items-center gap-2">
          {ten && (
            <Button variant="outline" size="sm" onClick={() => setGuideOpen(true)}>
              <BookOpen className="h-4 w-4" /> 规则说明
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
            <Settings2 className="h-4 w-4" /> 修改规则
          </Button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ten && (
          <p className="mb-3 text-xs text-muted">
            《天》二人麻将：得分按四人麻将的自摸收入计算，所以只有这两节规则生效。
          </p>
        )}
        <RulesEditor
          value={room.rules}
          onChange={() => undefined}
          editable={false}
          columns={2}
          groups={ruleGroups}
        />
      </div>
    </div>
  );
  const actions = (
    <div className="flex items-center gap-3">
      <Button
        size="lg"
        variant="accent"
        disabled={!allReady}
        onClick={() => send({ type: "start", force: false })}
      >
        <Play className="h-5 w-5" /> 开局
        {countdown !== null && <span className="tabular">· {countdown}</span>}
      </Button>
      <Button
        size="lg"
        variant="outline"
        disabled={!full}
        onClick={() => send({ type: "start", force: true })}
      >
        强制开局
      </Button>
      {blocker && <span className="text-sm whitespace-nowrap text-muted">{blocker}</span>}
      {/* 窄屏页脚并进按钮行，宽屏的在左栏 */}
      {wide ? null : <SiteFooter className="flex-1 justify-center" />}
      <span className={cn("flex items-center gap-2", wide && "ml-auto")}>
        {/* 窄屏的「本地玩家」在顶栏 */}
        {wide && (
          <Button size="lg" variant="ghost" onClick={() => openLocals(null)}>
            <Users className="h-5 w-5" /> 本地玩家
          </Button>
        )}
        {extraActions}
      </span>
    </div>
  );

  return (
    <div
      className={cn(
        "h-dvh",
        wide ? "grid grid-cols-[minmax(320px,2fr)_3fr] gap-8 p-8" : "flex flex-col gap-4 p-4",
      )}
    >
      {wide ? (
        <section className="flex flex-col rounded-3xl border border-border bg-surface p-8">
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <RoomQr code={room.code} size={240} />
            <p className="text-center text-sm text-muted">
              手机扫码加入，{ten ? "两" : "四"}人都点「准备」后即可开局。
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <SiteFooter />
            <SiteBrand className="shrink-0" />
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            房间码{" "}
            <span className="text-lg font-semibold tabular tracking-[0.2em] text-fg">
              {room.code}
            </span>
          </span>
          <RoomQrDialog code={room.code} open={qrOpen} onOpenChange={setQrOpen} />
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => openLocals(null)}>
            <Users className="h-4 w-4" /> 本地玩家
          </Button>
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col gap-4">
        {seats}
        {rulesCard}
        {actions}
      </section>

      <LocalPlayerDialog
        seat={localSeat}
        labels={labels}
        open={localOpen}
        onOpenChange={setLocalOpen}
        seatedIds={room.seats.flatMap((s) => (s ? [s.id] : []))}
        onSit={(seat, playerId) => send({ type: "sitLocal", seat, playerId })}
      />

      <RulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={room.rules}
        description="开局前可修改；开局后锁定。"
        className="sm:max-w-2xl"
        groups={ruleGroups}
        onApply={(rules) => send({ type: "setRules", rules })}
      />
      {ten && (
        <>
          <TenGuideDialog open={guideOpen} onOpenChange={setGuideOpen} castable={false} />
          <TenGuideMirror intents={intents} names={seatNames(room)} />
        </>
      )}
    </div>
  );
}
