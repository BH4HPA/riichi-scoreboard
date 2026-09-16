import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Settings2 } from "lucide-react";
import { presetNameOf, type RoomView, type Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useRoomStore } from "@/ws/store";
import { useCommand } from "@/ws/useRoom";
import { ProfileEditor } from "@/features/profile/ProfileEditor";
import { RulesEditor, RulesSummary } from "@/features/rules/RulesEditor";
import { useMirror } from "@/features/settlement/useMirror";
import { SiteFooter } from "@/features/site/SiteFooter";
import { SeatCards } from "./SeatCards";
import { useCountdown } from "./useCountdown";

export function PhoneLobby({ room, mySeat }: { room: RoomView; mySeat: Seat | null }) {
  const send = useCommand();
  const navigate = useNavigate();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState(room.rules);
  useMirror(rulesOpen, { kind: "rules" }, true);
  const ready = mySeat !== null && room.ready[mySeat] === true;
  const full = room.seats.every((s) => s !== null);
  const countdown = useCountdown(useRoomStore((s) => s.autoStartDeadline));
  // 退出房间：已入座先离座（等 ack），无论成败都回首页；失败的座位由离线回收兜底
  const exit = async () => {
    if (mySeat !== null) await send({ type: "leave", seat: mySeat });
    navigate("/");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="退出房间" onClick={exit}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-xs text-muted">房间</div>
            <div className="text-2xl font-semibold tabular tracking-[0.2em]">{room.code}</div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(room.rules);
            setRulesOpen(true);
          }}
        >
          <Settings2 className="h-4 w-4" /> 修改规则
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <ProfileEditor />
      </div>

      <div>
        <SeatCards
          seats={room.seats}
          ready={room.ready}
          online={room.online}
          mySeat={mySeat}
          onPick={(seat) => send({ type: "sit", seat })}
          onLeave={(seat) => send({ type: "leave", seat })}
        />
        {full && mySeat === null && (
          <p className="mt-2 text-center text-xs text-muted">
            座位已满；离线玩家可点右侧图标请离后入座
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-1.5 text-xs text-muted">房间规则 · {presetNameOf(room.rules)}</div>
        <RulesSummary rules={room.rules} />
      </div>

      <SiteFooter className="mt-auto justify-center" />

      {/* 准备按钮与开局提示贴在屏幕底部，内容多时页面在它上方滚动；换座直接点别的座位 */}
      {(mySeat !== null || (full && room.ready.every(Boolean))) && (
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          {mySeat !== null && (
            <Button
              size="lg"
              variant={ready ? "outline" : "accent"}
              className="w-full"
              onClick={() => send({ type: "setReady", seat: mySeat, ready: !ready })}
            >
              {ready ? "取消准备" : "准备"}
            </Button>
          )}
          {full && room.ready.every(Boolean) && (
            <p className="text-center text-sm text-muted">
              {countdown !== null ? `${countdown} 秒后自动开局…` : "全员已准备，等待主控台开局…"}
            </p>
          )}
        </div>
      )}

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent title="房间规则" description="开局前所有人都可修改；开局后锁定。">
          <RulesEditor value={draft} onChange={setDraft} editable />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRulesOpen(false)}>
              取消
            </Button>
            <Button
              variant="accent"
              onClick={async () => {
                if (await send({ type: "setRules", rules: draft })) setRulesOpen(false);
              }}
            >
              应用规则
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
