import { useState } from "react";
import { dealerOf, formatDiff, type Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useMirror } from "@/features/mirror/useMirror";
import { confirmRecognized } from "@/features/recognition/recognize";
import { useDraft } from "../drafts/useDraft";
import { missingText, tsumoSummary } from "../footerSummary";
import { seatsOf } from "../format";
import { previewTsumo } from "../preview";
import { winnerDraftAfterSeed } from "../riichiSeed";
import { draftForWinner, draftWithRiichi, effectiveRiichi, storeRiichiClick } from "../riichiSync";
import { PaoPicker, SeatFlags, SeatSelect } from "../SeatFlags";
import {
  createValueDraft,
  draftToClientValue,
  draftValue,
  missingValue,
  type ValueDraft,
} from "../valueDraft";
import { readValueMode } from "../valueModePref";
import { ValuePicker } from "../ValuePicker";
import { mirrorWin } from "./mirrorWin";
import { roundDescription, type SettlementDialogProps, type SettlementFormProps } from "./shared";
import { SettlementDialog } from "./SettlementDialog";
import { useDeclaredRiichi } from "./useDeclaredRiichi";
import { FooterSummary, WinPreview } from "./WinPreview";

export function TsumoDialog({ open, onOpenChange, game, names, ...rest }: SettlementDialogProps) {
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title="自摸结算"
      description={roundDescription(game, names)}
    >
      {(onDone) => <TsumoForm game={game} names={names} {...rest} onDone={onDone} />}
    </SettlementDialog>
  );
}

interface TsumoFormState {
  /** 已入座的手机默认自己；主控台与未入座的手机为 null，必须明确选 */
  winner: Seat | null;
  draft: ValueDraft;
  riichi: boolean[];
  /** 已并入过的本局立直声明（见 riichiSeed） */
  seededRiichi: boolean[];
  pao: Seat | null;
}

/** 表单状态存在草稿里：关掉再开还在；局面变了弹窗自动关闭（见 useDraft）。 */
function TsumoForm({ game, names, rules, mirror, mySeat, onDone }: SettlementFormProps) {
  const send = useCommand();
  const form = useDraft<TsumoFormState>(
    "tsumo",
    () => ({
      winner: mySeat,
      draft: draftWithRiichi(
        createValueDraft(true, readValueMode()),
        mySeat !== null && game.riichi[mySeat]!,
      ),
      riichi: [...game.riichi],
      seededRiichi: [...game.riichi],
      pao: null,
    }),
    onDone,
  );
  const { winner, draft, riichi, pao } = form.state;
  useDeclaredRiichi(form, game.riichi, (st, next) => ({
    ...st,
    draft: winnerDraftAfterSeed(st.draft, st.winner, st.riichi, next),
  }));
  const setDraft = (fn: (d: ValueDraft) => ValueDraft) =>
    form.update((st) => ({ ...st, draft: fn(st.draft) }));
  const [busy, setBusy] = useState(false);

  const flags = effectiveRiichi(riichi, [{ winner, draft }]);
  const changeRiichi = (next: boolean[]) =>
    form.update((st) => ({
      ...st,
      riichi: storeRiichiClick(st.riichi, flags, next),
      draft: st.winner === null ? st.draft : draftWithRiichi(st.draft, next[st.winner]!),
    }));
  const changeWinner = (next: Seat) =>
    form.update((st) => ({
      ...st,
      winner: next,
      draft: draftForWinner(st.draft, st.riichi, st.winner, next),
    }));

  const value = draftValue(draft);
  const paoAllowed = rules.scoring.pao && value !== null && value.yakuman > 0;
  const effectivePao = paoAllowed ? pao : null;
  const preview =
    value && winner !== null
      ? previewTsumo(game, rules, winner, value, seatsOf(flags), effectivePao)
      : null;
  const summary =
    preview && winner !== null
      ? `${names[winner]} 自摸 ${preview.valueText}，收入 ${formatDiff(preview.payment.deltas[winner]!)} 点`
      : null;
  const footer =
    preview && winner !== null
      ? tsumoSummary(names, winner, preview.payment.deltas, effectivePao)
      : missingText([...(winner === null ? ["自摸者"] : []), ...missingValue(draft)]);
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "tsumo",
      deltas: preview?.payment.deltas ?? null,
      summary,
      loser: null,
      riichi: seatsOf(flags),
      wins: winner === null ? [] : [mirrorWin(winner, draft, preview?.valueText ?? null)],
    },
    mirror,
  );

  const confirm = async () => {
    if (winner === null) return;
    setBusy(true);
    const ok = await form.submit(() =>
      send({
        type: "tsumo",
        winner,
        value: draftToClientValue(draft),
        riichi: seatsOf(flags),
        ...(effectivePao !== null ? { pao: effectivePao } : {}),
      }),
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
        {form.touched && <ResetDraft onReset={form.reset} />}
        <SeatSelect
          label="自摸者"
          names={names}
          mySeat={mySeat}
          value={winner}
          onChange={changeWinner}
        />
        <SeatFlags
          label="立直情况"
          names={names}
          mySeat={mySeat}
          value={flags}
          onChange={changeRiichi}
        />
        <ValuePicker
          draft={draft}
          onChange={setDraft}
          rules={rules}
          seat={winner}
          dealer={dealerOf(game.kyoku)}
        />
        {paoAllowed && winner !== null && (
          <PaoPicker
            names={names}
            mySeat={mySeat}
            winner={winner}
            value={pao}
            onChange={(p) => form.update((st) => ({ ...st, pao: p }))}
          />
        )}
        <WinPreview
          names={names}
          deltas={preview && winner !== null ? preview.payment.deltas : null}
          incomes={
            preview && winner !== null
              ? [
                  {
                    seat: winner,
                    verb: "自摸",
                    baseIncome: preview.baseIncome,
                    payment: preview.payment,
                  },
                ]
              : []
          }
        />
      </div>
      <DialogFooter className="flex-wrap">
        <FooterSummary text={footer} ready={preview !== null} />
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button variant="accent" onClick={confirm} disabled={!preview || busy}>
          确认自摸
        </Button>
      </DialogFooter>
    </>
  );
}

/** 草稿动过才出现：清空当前录入，回到默认值。 */
export function ResetDraft({ onReset }: { onReset: () => void }) {
  return (
    <div className="-mb-2 flex justify-end">
      <Button variant="ghost" size="sm" className="h-7 text-muted" onClick={onReset}>
        清空重填
      </Button>
    </div>
  );
}
