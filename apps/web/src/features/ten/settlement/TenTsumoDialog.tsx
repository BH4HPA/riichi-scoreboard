import { useState } from "react";
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
  // 只在 Stage B 打开；别人撤销了宣言时草稿的局面戳会变，表单随之关闭，这里先不渲染
  if (stage.kind !== "B") return null;
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`自摸和 · ${rest.names[stage.attacker]}（${tenDeclareLabel(stage.riichi)}）`}
      description={`${tenRoundLabel(game.round, game.honba)}，庄家：${rest.names[game.dealer]}`}
    >
      {(onDone) => <TenTsumoForm game={game} stage={stage} {...rest} onDone={onDone} />}
    </SettlementDialog>
  );
}

function TenTsumoForm({
  game,
  stage,
  names,
  rules,
  mirror,
  onDone,
}: Props & { stage: StageB; onDone: () => void }) {
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
    const ok = await form.submit(() =>
      send({ type: "tenTsumo", value: draftToClientValue(draft) }),
    );
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
          riichiLock={{
            on: stage.riichi,
            note: stage.riichi
              ? "本局是立直宣言：立直已勾上，不能取消。"
              : "本局是听牌宣言：不算立直，也没有一发和里宝。",
          }}
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
