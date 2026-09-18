import { useState } from "react";
import { dealerOf, formatDiff, type Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useMirror } from "@/features/mirror/useMirror";
import { confirmRecognized } from "@/features/recognition/recognize";
import { useDraft } from "../drafts/useDraft";
import { missingText, ronSummary } from "../footerSummary";
import { seatsOf } from "../format";
import { previewRon } from "../preview";
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
import { ResetDraft } from "./TsumoDialog";
import { useDeclaredRiichi } from "./useDeclaredRiichi";
import { FooterSummary, WinPreview } from "./WinPreview";

export function RonDialog({ open, onOpenChange, game, names, ...rest }: SettlementDialogProps) {
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title="荣和结算"
      description={roundDescription(game, names)}
    >
      {(onDone) => <RonForm game={game} names={names} {...rest} onDone={onDone} />}
    </SettlementDialog>
  );
}

interface RonWinDraftState {
  winner: Seat | null;
  draft: ValueDraft;
  pao: Seat | null;
}

interface RonFormState {
  /** 放铳者不给默认值，必须明确选 */
  loser: Seat | null;
  wins: RonWinDraftState[];
  riichi: boolean[];
  /** 已并入过的本局立直声明（见 riichiSeed） */
  seededRiichi: boolean[];
}

function RonForm({ game, names, rules, mirror, mySeat, onDone }: SettlementFormProps) {
  const send = useCommand();
  const maxWins = { atamahane: 1, double: 2, triple: 3 }[rules.win.multiRon];
  const form = useDraft<RonFormState>(
    "ron",
    () => ({
      loser: null,
      wins: [
        {
          winner: mySeat,
          draft: draftWithRiichi(
            createValueDraft(false, readValueMode()),
            mySeat !== null && game.riichi[mySeat]!,
          ),
          pao: null,
        },
      ],
      riichi: [...game.riichi],
      seededRiichi: [...game.riichi],
    }),
    onDone,
  );
  const { loser, wins, riichi } = form.state;
  useDeclaredRiichi(form, game.riichi, (st, next) => ({
    ...st,
    wins: st.wins.map((w) => ({
      ...w,
      draft: winnerDraftAfterSeed(w.draft, w.winner, st.riichi, next),
    })),
  }));
  const setWins = (fn: (ws: RonWinDraftState[]) => RonWinDraftState[]) =>
    form.update((st) => ({ ...st, wins: fn(st.wins) }));
  const [busy, setBusy] = useState(false);
  const flags = effectiveRiichi(riichi, wins);

  const drafts = wins.map((w) => {
    const value = draftValue(w.draft);
    const paoAllowed = rules.scoring.pao && value !== null && value.yakuman > 0;
    return { winner: w.winner, value, pao: paoAllowed ? w.pao : null, paoAllowed };
  });
  const allValued = drafts.every((d) => d.value !== null);
  const chosen = wins.flatMap((w) => (w.winner === null ? [] : [w.winner]));
  const distinct =
    new Set(chosen).size === chosen.length && (loser === null || !chosen.includes(loser));
  const picked = loser !== null && chosen.length === wins.length;
  const preview =
    allValued && distinct && picked
      ? previewRon(
          game,
          rules,
          loser,
          drafts.map((d) => ({ winner: d.winner!, value: d.value!, pao: d.pao })),
          seatsOf(flags),
        )
      : null;
  const summary =
    preview && loser !== null
      ? preview.wins
          .map(
            (p, i) =>
              `${names[wins[i]!.winner!]} 荣和 ${names[loser]} ${p.valueText}，收入 ${formatDiff(preview.deltas[wins[i]!.winner!]!)} 点`,
          )
          .join("；")
      : null;
  const footer =
    preview && loser !== null
      ? ronSummary(
          names,
          loser,
          drafts.map((d) => ({ winner: d.winner!, pao: d.pao })),
          preview.deltas,
        )
      : !distinct
        ? "荣和者与放铳者不能重复"
        : missingText([
            ...(loser === null ? ["放铳者"] : []),
            ...wins.flatMap((w) => (w.winner === null ? ["荣和者"] : [])),
            ...wins.flatMap((w) => missingValue(w.draft)),
          ]);
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "ron",
      deltas: preview?.deltas ?? null,
      summary,
      loser,
      riichi: seatsOf(flags),
      wins: wins.flatMap((w, i) =>
        w.winner === null
          ? []
          : [mirrorWin(w.winner, w.draft, preview?.wins[i]?.valueText ?? null)],
      ),
    },
    mirror,
  );

  const confirm = async () => {
    if (!preview || loser === null) return;
    setBusy(true);
    const ok = await form.submit(() =>
      send({
        type: "ron",
        loser,
        wins: wins.map((w, i) => ({
          winner: w.winner!,
          value: draftToClientValue(w.draft),
          ...(drafts[i]!.pao !== null ? { pao: drafts[i]!.pao! } : {}),
        })),
        riichi: seatsOf(flags),
      }),
    );
    setBusy(false);
    if (ok) {
      for (const w of wins) void confirmRecognized(w.draft);
      onDone();
    }
  };

  const setWin = (i: number, patch: Partial<RonWinDraftState>) =>
    setWins((ws) => ws.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  const changeRiichi = (next: boolean[]) =>
    form.update((st) => ({
      ...st,
      riichi: storeRiichiClick(st.riichi, flags, next),
      wins: st.wins.map((w) =>
        w.winner === null ? w : { ...w, draft: draftWithRiichi(w.draft, next[w.winner]!) },
      ),
    }));
  const changeWinner = (i: number, winner: Seat) =>
    form.update((st) => ({
      ...st,
      wins: st.wins.map((w, k) =>
        k === i ? { ...w, winner, draft: draftForWinner(w.draft, st.riichi, w.winner, winner) } : w,
      ),
    }));
  const removeWin = (i: number) => setWins((ws) => ws.filter((_, k) => k !== i));
  const addWin = () =>
    setWins((ws) => [
      ...ws,
      { winner: null, draft: createValueDraft(false, readValueMode()), pao: null },
    ]);
  /** 评估结果异步回来时用函数式更新，避免覆盖期间的改动 */
  const updateDraft = (i: number, update: (d: ValueDraft) => ValueDraft) =>
    setWins((ws) => ws.map((w, k) => (k === i ? { ...w, draft: update(w.draft) } : w)));

  return (
    <>
      <div className="space-y-3">
        {form.touched && <ResetDraft onReset={form.reset} />}
        <SeatSelect
          label="放铳者"
          names={names}
          mySeat={mySeat}
          value={loser}
          onChange={(l) => form.update((st) => ({ ...st, loser: l }))}
        />
        <SeatFlags
          label="立直情况"
          names={names}
          mySeat={mySeat}
          value={flags}
          onChange={changeRiichi}
        />
        {wins.map((w, i) => (
          <div key={i} className="rounded-lg border border-border p-2.5">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SeatSelect
                  mySeat={mySeat}
                  label={`荣和者${wins.length > 1 ? ` ${i + 1}` : ""}`}
                  names={names}
                  value={w.winner}
                  onChange={(winner) => changeWinner(i, winner)}
                  exclude={loser === null ? [] : [loser]}
                />
              </div>
              {wins.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeWin(i)}>
                  移除
                </Button>
              )}
            </div>
            <div className="mt-2">
              <ValuePicker
                draft={w.draft}
                onChange={(update) => updateDraft(i, update)}
                rules={rules}
                seat={w.winner}
                dealer={dealerOf(game.kyoku)}
              />
            </div>
            {drafts[i]!.paoAllowed && w.winner !== null && (
              <div className="mt-2">
                <PaoPicker
                  names={names}
                  mySeat={mySeat}
                  winner={w.winner}
                  value={w.pao}
                  onChange={(pao) => setWin(i, { pao })}
                />
              </div>
            )}
          </div>
        ))}
        {wins.length < maxWins && (
          <Button variant="outline" size="sm" onClick={addWin}>
            添加荣和者（{rules.win.multiRon === "double" ? "双响" : "三响"}）
          </Button>
        )}
        {!distinct && (
          <p className="text-xs text-neg">荣和者与放铳者不能是同一人，荣和者之间不能重复</p>
        )}
        <WinPreview
          names={names}
          deltas={preview?.deltas ?? null}
          incomes={
            preview
              ? preview.wins.map((p, i) => ({
                  seat: wins[i]!.winner!,
                  verb: "荣和",
                  baseIncome: p.baseIncome,
                  payment: p.payment,
                }))
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
          确认荣和
        </Button>
      </DialogFooter>
    </>
  );
}
