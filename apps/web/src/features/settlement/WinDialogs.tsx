import { useEffect, useState } from "react";
import {
  dealerOf,
  formatDiff,
  roundLabel,
  type GameState,
  type RoomRules,
  type Seat,
  type SettlementWinView,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useSession } from "@/api/session";
import { confirmRecognized } from "@/features/recognition/recognize";
import { ValuePicker } from "./ValuePicker";
import {
  createValueDraft,
  draftToClientValue,
  draftValue,
  missingValue,
  type ValueDraft,
} from "./valueDraft";
import { readValueMode } from "./valueModePref";
import { draftForWinner, draftWithRiichi, effectiveRiichi, storeRiichiClick } from "./riichiSync";
import { PreviewGrid } from "./PreviewGrid";
import { incomeBreakdown, seatsOf } from "./format";
import { previewRon, previewTsumo } from "./preview";
import { PaoPicker, SeatFlags, SeatSelect } from "./SeatFlags";
import { useMirror } from "./useMirror";
import { useDraft } from "./drafts/useDraft";
import { seedRiichi } from "./riichiSeed";
import { missingText, ronSummary, tsumoSummary } from "./footerSummary";

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
/** 底栏按钮上方独占一行：填齐了是「谁和了谁 · 收入」，没填齐是还缺什么。 */
function FooterSummary({ text, ready }: { text: string; ready: boolean }) {
  return (
    <p
      className={cn("basis-full text-sm", ready ? "font-medium" : "text-muted")}
      data-testid="settlement-summary"
    >
      {text}
    </p>
  );
}

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
  /** 已入座的手机默认自己；主控台与未入座的手机为 null，必须明确选 */
  winner: Seat | null;
  draft: ValueDraft;
  riichi: boolean[];
  /** 已并入过的本局立直声明（见 riichiSeed） */
  seededRiichi: boolean[];
  pao: Seat | null;
}

/** 表单状态存在草稿里：关掉再开还在；局面变了弹窗自动关闭（见 useDraft）。 */
function TsumoForm({ game, names, rules, mirror, mySeat, onDone }: FormProps) {
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
  // 弹窗开着时有人按了立直：新声明并进勾选（用户取消过的不勾回）
  useEffect(() => {
    form.update((st) => {
      const seed = seedRiichi({ riichi: st.riichi, seeded: st.seededRiichi }, game.riichi);
      if (seed.riichi === st.riichi) return st;
      const draft =
        st.winner === null ? st.draft : draftWithRiichi(st.draft, seed.riichi[st.winner]!);
      return { ...st, riichi: seed.riichi, seededRiichi: seed.seeded, draft };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在声明变化时并入
  }, [game.riichi]);
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
        {paoAllowed && winner !== null && (
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
          {preview && winner !== null ? (
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

function RonForm({ game, names, rules, mirror, mySeat, onDone }: FormProps) {
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
  // 弹窗开着时有人按了立直：新声明并进勾选（用户取消过的不勾回）
  useEffect(() => {
    form.update((st) => {
      const seed = seedRiichi({ riichi: st.riichi, seeded: st.seededRiichi }, game.riichi);
      if (seed.riichi === st.riichi) return st;
      return {
        ...st,
        riichi: seed.riichi,
        seededRiichi: seed.seeded,
        wins: st.wins.map((w) =>
          w.winner === null ? w : { ...w, draft: draftWithRiichi(w.draft, seed.riichi[w.winner]!) },
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在声明变化时并入
  }, [game.riichi]);
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
        <div>
          <Label>结算预览</Label>
          {preview ? (
            <>
              <PreviewGrid deltas={preview.deltas} names={names} className="mt-1" />
              {preview.wins.map((p, i) => (
                <div key={i} className="mt-2">
                  <p className="text-sm">
                    {names[wins[i]!.winner!]} 荣和的最终收入：
                    <span className="font-semibold text-pos">
                      {formatDiff(preview.deltas[wins[i]!.winner!]!)}
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
