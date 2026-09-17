import { useState } from "react";
import {
  dealerOf,
  formatDiff,
  roundLabel,
  SEATS,
  type GameState,
  type RoomRules,
  type Seat,
  type SettlementWinView,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { Label } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useSession } from "@/api/session";
import { confirmRecognized } from "@/features/recognition/recognize";
import { ValuePicker } from "./ValuePicker";
import { createValueDraft, draftToClientValue, draftValue, type ValueDraft } from "./valueDraft";
import { readValueMode } from "./valueModePref";
import { draftForWinner, draftWithRiichi, effectiveRiichi, storeRiichiClick } from "./riichiSync";
import { PreviewGrid } from "./PreviewGrid";
import { NO_FLAGS, incomeBreakdown, seatsOf } from "./format";
import { previewRon, previewTsumo } from "./preview";
import { PaoPicker, SeatFlags, SeatSelect } from "./SeatFlags";
import { useMirror } from "./useMirror";
import { useDraft } from "./drafts/useDraft";

export interface WinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  mySeat: Seat | null;
}

interface FormProps {
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  mySeat: Seat | null;
  onDone: () => void;
}

/** 镜像用的和牌者视图：牌面模式且已算出结果时才带手牌（半手牌会被服务端拒绝）。 */
function mirrorWin(winner: Seat, draft: ValueDraft, valueText: string | null): SettlementWinView {
  const evaluated = draft.mode === "hand" ? draft.evaluated : null;
  return {
    winner,
    valueText,
    hand: evaluated ? draft.hand : null,
    evaluated,
  };
}

/** 草稿动过才出现：清空当前录入，回到默认值。 */
function ResetDraft({ onReset }: { onReset: () => void }) {
  return (
    <div className="-mb-2 flex justify-end">
      <Button variant="ghost" size="sm" className="h-7 text-muted" onClick={onReset}>
        清空重填
      </Button>
    </div>
  );
}

function description(game: GameState, names: string[]): string {
  return `${roundLabel(game.kyoku, game.honba)}，庄家：${names[dealerOf(game.kyoku)]}`;
}

export function TsumoDialog(props: WinDialogProps) {
  const { open, onOpenChange, game, names, ...rest } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="自摸结算" description={description(game, names)}>
        <TsumoForm game={game} names={names} {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface TsumoFormState {
  winner: Seat;
  draft: ValueDraft;
  riichi: boolean[];
  pao: Seat | null;
}

/** 表单状态存在草稿里：关掉再开还在；局面变了弹窗自动关闭（见 useDraft）。 */
function TsumoForm({ game, names, rules, mirror, mySeat, onDone }: FormProps) {
  const send = useCommand();
  const form = useDraft<TsumoFormState>(
    "tsumo",
    () => ({
      winner: mySeat ?? 0,
      draft: createValueDraft(true, readValueMode()),
      riichi: NO_FLAGS,
      pao: null,
    }),
    onDone,
  );
  const { winner, draft, riichi, pao } = form.state;
  const setDraft = (fn: (d: ValueDraft) => ValueDraft) =>
    form.update((st) => ({ ...st, draft: fn(st.draft) }));
  const [busy, setBusy] = useState(false);

  const flags = effectiveRiichi(riichi, [{ winner, draft }]);
  const changeRiichi = (next: boolean[]) =>
    form.update((st) => ({
      ...st,
      riichi: storeRiichiClick(st.riichi, flags, next),
      draft: draftWithRiichi(st.draft, next[st.winner]!),
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
  const preview = value
    ? previewTsumo(game, rules, winner, value, seatsOf(flags), effectivePao)
    : null;
  const summary = preview
    ? `${names[winner]} 自摸 ${preview.valueText}，收入 ${formatDiff(preview.payment.deltas[winner]!)} 点`
    : null;
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "tsumo",
      deltas: preview?.payment.deltas ?? null,
      summary,
      loser: null,
      riichi: seatsOf(flags),
      wins: [mirrorWin(winner, draft, preview?.valueText ?? null)],
    },
    mirror,
  );

  const confirm = async () => {
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
      confirmRecognized(draft, useSession.getState().token);
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
        {paoAllowed && (
          <PaoPicker
            names={names}
            mySeat={mySeat}
            winner={winner}
            value={pao}
            onChange={(p) => form.update((st) => ({ ...st, pao: p }))}
          />
        )}
        <div>
          <Label>结算预览</Label>
          {preview ? (
            <>
              <PreviewGrid deltas={preview.payment.deltas} names={names} className="mt-1" />
              <p className="mt-2 text-sm">
                {names[winner]} 自摸的最终收入：
                <span className="font-semibold text-pos">
                  {formatDiff(preview.payment.deltas[winner]!)}
                </span>{" "}
                点
              </p>
              <p className="text-xs text-muted">
                {incomeBreakdown({
                  base: preview.baseIncome,
                  honba: preview.payment.honbaIncome,
                  kyotaku: preview.payment.kyotakuIncome,
                  riichi: preview.payment.riichiIncome,
                })}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">请先完整选择和填写</p>
          )}
        </div>
      </div>
      <DialogFooter>
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

export function RonDialog(props: WinDialogProps) {
  const { open, onOpenChange, game, names, ...rest } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="荣和结算" description={description(game, names)}>
        <RonForm game={game} names={names} {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface RonWinDraftState {
  winner: Seat;
  draft: ValueDraft;
  pao: Seat | null;
}

interface RonFormState {
  loser: Seat;
  wins: RonWinDraftState[];
  riichi: boolean[];
}

function RonForm({ game, names, rules, mirror, mySeat, onDone }: FormProps) {
  const send = useCommand();
  const maxWins = { atamahane: 1, double: 2, triple: 3 }[rules.win.multiRon];
  const me = mySeat ?? 0;
  const form = useDraft<RonFormState>(
    "ron",
    () => ({
      loser: SEATS.find((s) => s !== me) ?? 1,
      wins: [{ winner: me, draft: createValueDraft(false, readValueMode()), pao: null }],
      riichi: NO_FLAGS,
    }),
    onDone,
  );
  const { loser, wins, riichi } = form.state;
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
  const distinct =
    new Set(wins.map((w) => w.winner)).size === wins.length &&
    !wins.some((w) => w.winner === loser);
  const preview =
    allValued && distinct
      ? previewRon(
          game,
          rules,
          loser,
          drafts.map((d) => ({ winner: d.winner, value: d.value!, pao: d.pao })),
          seatsOf(flags),
        )
      : null;
  const summary = preview
    ? preview.wins
        .map(
          (p, i) =>
            `${names[wins[i]!.winner]} 荣和 ${names[loser]} ${p.valueText}，收入 ${formatDiff(preview.deltas[wins[i]!.winner]!)} 点`,
        )
        .join("；")
    : null;
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "ron",
      deltas: preview?.deltas ?? null,
      summary,
      loser,
      riichi: seatsOf(flags),
      wins: wins.map((w, i) => mirrorWin(w.winner, w.draft, preview?.wins[i]?.valueText ?? null)),
    },
    mirror,
  );

  const confirm = async () => {
    setBusy(true);
    const ok = await form.submit(() =>
      send({
        type: "ron",
        loser,
        wins: wins.map((w, i) => ({
          winner: w.winner,
          value: draftToClientValue(w.draft),
          ...(drafts[i]!.pao !== null ? { pao: drafts[i]!.pao! } : {}),
        })),
        riichi: seatsOf(flags),
      }),
    );
    setBusy(false);
    if (ok) {
      const token = useSession.getState().token;
      for (const w of wins) confirmRecognized(w.draft, token);
      onDone();
    }
  };

  const setWin = (i: number, patch: Partial<RonWinDraftState>) =>
    setWins((ws) => ws.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  const changeRiichi = (next: boolean[]) =>
    form.update((st) => ({
      ...st,
      riichi: storeRiichiClick(st.riichi, flags, next),
      wins: st.wins.map((w) => ({ ...w, draft: draftWithRiichi(w.draft, next[w.winner]!) })),
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
    form.update((st) => {
      const winner = SEATS.find((s) => s !== st.loser && !st.wins.some((w) => w.winner === s)) ?? 0;
      const draft = draftWithRiichi(createValueDraft(false, readValueMode()), st.riichi[winner]!);
      return { ...st, wins: [...st.wins, { winner, draft, pao: null }] };
    });
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
                  exclude={[loser]}
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
            {drafts[i]!.paoAllowed && (
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
        <div>
          <Label>结算预览</Label>
          {preview ? (
            <>
              <PreviewGrid deltas={preview.deltas} names={names} className="mt-1" />
              {preview.wins.map((p, i) => (
                <div key={i} className="mt-2">
                  <p className="text-sm">
                    {names[wins[i]!.winner]} 荣和的最终收入：
                    <span className="font-semibold text-pos">
                      {formatDiff(preview.deltas[wins[i]!.winner]!)}
                    </span>{" "}
                    点
                  </p>
                  <p className="text-xs text-muted">
                    {incomeBreakdown({
                      base: p.baseIncome,
                      honba: p.payment.honbaIncome,
                      kyotaku: p.payment.kyotakuIncome,
                      riichi: p.payment.riichiIncome,
                    })}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">请先完整选择和填写</p>
          )}
        </div>
      </div>
      <DialogFooter>
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
