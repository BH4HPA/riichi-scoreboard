import { useEffect, useRef, useState, type RefObject } from "react";
import {
  describeValue,
  formatPoints,
  scoreTier,
  tenDeclareLabel,
  tenRoundLabel,
  winPoints,
  type RoomRules,
  type TenGameState,
  type TenStage,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { DialogFooter } from "@/ui/dialog";
import { useRoomStore } from "@/ws/store";
import { useCommand } from "@/ws/useRoom";
import { useMirror } from "@/features/mirror/useMirror";
import { confirmRecognized } from "@/features/recognition/recognize";
import { SettlementDialog } from "@/features/settlement/dialogs/SettlementDialog";
import { mirrorWin } from "@/features/settlement/dialogs/mirrorWin";
import { FooterSummary } from "@/features/settlement/dialogs/WinPreview";
import { useDraft } from "@/features/settlement/drafts/useDraft";
import { missingText } from "@/features/settlement/footerSummary";
import { draftWithRiichi } from "@/features/settlement/riichiSync";
import {
  createValueDraft,
  draftToClientValue,
  draftValue,
  missingValue,
  type ValueDraft,
} from "@/features/settlement/valueDraft";
import { readValueMode } from "@/features/settlement/valueModePref";
import { ValuePicker } from "@/features/settlement/ValuePicker";

type StageB = Extract<TenStage, { kind: "B" }>;

interface Props {
  game: TenGameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
}

/**
 * 自摸和：和牌者恒为进攻方（不用选人），立直与否由本局的宣言决定（开关锁住并写明原因）。
 * 手牌录入、拍照识别、自动算番与四人房是同一套组件；得分 = 这手牌在四人麻将里自摸的总收入（含本场）。
 */
export function TenTsumoDialog({
  open,
  onOpenChange,
  game,
  ...rest
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { stage } = game;
  // 自己提交的那一笔会让阶段回到 A，而状态广播先于 ack 到达：那不是「局面被别人改了」，关闭器不该提示
  const submitting = useRef(false);
  const round = `${tenRoundLabel(game.round, game.honba)}，庄家：${rest.names[game.dealer]}`;
  // 弹窗开着时别人撤销了宣言：阶段回到 A。表单不能跟着消失了事——这里的开关状态还留着，下次再有人宣言它会自己
  // 弹回来——所以照常渲染一个关闭器，走与「局面已变化」同样的提示与关闭。
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        stage.kind === "B"
          ? `自摸和 · ${rest.names[stage.attacker]}（${tenDeclareLabel(stage.riichi)}）`
          : "自摸和"
      }
      description={round}
    >
      {(onDone) =>
        stage.kind === "B" ? (
          <TenTsumoForm
            game={game}
            stage={stage}
            {...rest}
            onSubmitting={(flag) => {
              submitting.current = flag;
            }}
            onDone={onDone}
          />
        ) : (
          <StaleCloser submitting={submitting} onDone={onDone} />
        )
      }
    </SettlementDialog>
  );
}

/** 它的出现本身就意味着要关：挂载时关闭弹窗；不是自己提交造成的才提示 */
function StaleCloser({
  submitting,
  onDone,
}: {
  submitting: RefObject<boolean>;
  onDone: () => void;
}) {
  const notify = useRoomStore((s) => s.notify);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!submitting.current) notify("info", "局面已变化，结算已关闭");
    done.current();
  }, [notify, submitting]);
  return null;
}

function TenTsumoForm({
  game,
  stage,
  names,
  rules,
  mirror,
  onSubmitting,
  onDone,
}: Props & { stage: StageB; onSubmitting: (flag: boolean) => void; onDone: () => void }) {
  const send = useCommand();
  const winner = stage.attacker;
  const form = useDraft<{ draft: ValueDraft }>(
    "tsumo",
    () => ({ draft: draftWithRiichi(createValueDraft(true, readValueMode()), stage.riichi) }),
    onDone,
  );
  const { draft } = form.state;
  const [busy, setBusy] = useState(false);

  const value = draftValue(draft);
  const gain = value
    ? winPoints(value, { dealer: winner === game.dealer, tsumo: true, honba: game.honba }, rules)
        .total
    : null;
  const valueText = value ? describeValue(value, scoreTier(value, rules)) : null;
  const summary =
    gain !== null
      ? `${names[winner]}（${tenDeclareLabel(stage.riichi)}）自摸 ${valueText}，得 ${formatPoints(gain)} 点`
      : null;
  useMirror(
    true,
    {
      kind: "tenSettlement",
      mode: "tsumo",
      summary,
      gain,
      win: mirrorWin(winner, draft, valueText),
    },
    mirror,
  );

  const confirm = async () => {
    setBusy(true);
    onSubmitting(true);
    const ok = await form
      .submit(() => send({ type: "tenTsumo", value: draftToClientValue(draft) }))
      .finally(() => onSubmitting(false));
    setBusy(false);
    if (ok) {
      void confirmRecognized(draft);
      onDone();
    }
  };

  return (
    <>
      <div className="space-y-3">
        <ValuePicker
          draft={draft}
          onChange={(fn) => form.update((st) => ({ draft: fn(st.draft) }))}
          rules={rules}
          seat={winner}
          dealer={game.dealer}
          riichiLock={stage.riichi}
        />
        {draft.mode === "manual" && stage.riichi && (
          <p className="text-xs text-muted">手填番数时记得把立直的一番（和一发、里宝）算进去。</p>
        )}
      </div>
      <DialogFooter className="flex-wrap">
        <FooterSummary
          text={
            summary
              ? `${summary}${game.honba > 0 ? `（含 ${game.honba} 本场）` : ""}；对手不扣分`
              : missingText(missingValue(draft))
          }
          ready={summary !== null}
        />
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button variant="accent" onClick={confirm} disabled={gain === null || busy}>
          确认自摸和
        </Button>
      </DialogFooter>
    </>
  );
}
