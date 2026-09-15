import { useState } from "react";
import {
  dealerOf,
  formatDiff,
  roundLabel,
  SEATS,
  type GameState,
  type RoomRules,
  type Seat,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { Label, Select } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { ValuePicker } from "./ValuePicker";
import { createValueDraft, draftToClientValue, draftValue, type ValueDraft } from "./valueDraft";
import { PreviewGrid } from "./PreviewGrid";
import { NO_FLAGS, incomeBreakdown, seatOptions, seatsOf } from "./format";
import { previewRon, previewTsumo } from "./preview";
import { SeatFlags, SeatSelect } from "./SeatFlags";
import { useMirror } from "./useMirror";

export interface WinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  defaultSeat: Seat | null;
}

interface FormProps {
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  defaultSeat: Seat | null;
  onDone: () => void;
}

/** 包牌者：仅规则开启且当前价值为役满时可选。 */
function PaoPicker({
  names,
  winner,
  value,
  onChange,
}: {
  names: string[];
  winner: Seat;
  value: Seat | null;
  onChange: (v: Seat | null) => void;
}) {
  return (
    <div>
      <Label>包牌（责任払い）</Label>
      <Select
        value={value === null ? "none" : String(value)}
        onValueChange={(v) => onChange(v === "none" ? null : (Number(v) as Seat))}
        options={[{ value: "none", label: "无" }, ...seatOptions(names, [winner])]}
        className="mt-1"
      />
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

/** 每次打开重新挂载：默认和牌者为操作者自己，草稿不跨次残留。 */
function TsumoForm({ game, names, rules, mirror, defaultSeat, onDone }: FormProps) {
  const send = useCommand();
  const [winner, setWinner] = useState<Seat>(defaultSeat ?? 0);
  const [draft, setDraft] = useState<ValueDraft>(() => createValueDraft(true));
  const [riichi, setRiichi] = useState(NO_FLAGS);
  const [pao, setPao] = useState<Seat | null>(null);
  const [busy, setBusy] = useState(false);

  const value = draftValue(draft);
  const paoAllowed = rules.scoring.pao && value !== null && value.yakuman > 0;
  const effectivePao = paoAllowed ? pao : null;
  const preview = value
    ? previewTsumo(game, rules, winner, value, seatsOf(riichi), effectivePao)
    : null;
  const summary = preview
    ? `${names[winner]} 自摸 ${preview.valueText}，收入 ${formatDiff(preview.payment.deltas[winner]!)} 点`
    : null;
  useMirror(
    true,
    { kind: "settlement", mode: "tsumo", deltas: preview?.payment.deltas ?? null, summary },
    mirror,
  );

  const confirm = async () => {
    setBusy(true);
    const ok = await send({
      type: "tsumo",
      winner,
      value: draftToClientValue(draft),
      riichi: seatsOf(riichi),
      ...(effectivePao !== null ? { pao: effectivePao } : {}),
    });
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <>
      <div className="space-y-3">
        <SeatSelect label="自摸者" names={names} value={winner} onChange={setWinner} />
        <ValuePicker draft={draft} onChange={setDraft} rules={rules} seat={winner} />
        <SeatFlags label="立直情况" names={names} value={riichi} onChange={setRiichi} />
        {paoAllowed && <PaoPicker names={names} winner={winner} value={pao} onChange={setPao} />}
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

function RonForm({ game, names, rules, mirror, defaultSeat, onDone }: FormProps) {
  const send = useCommand();
  const maxWins = { atamahane: 1, double: 2, triple: 3 }[rules.win.multiRon];
  const me = defaultSeat ?? 0;
  const [loser, setLoser] = useState<Seat>(SEATS.find((s) => s !== me) ?? 1);
  const [wins, setWins] = useState<RonWinDraftState[]>(() => [
    { winner: me, draft: createValueDraft(false), pao: null },
  ]);
  const [riichi, setRiichi] = useState(NO_FLAGS);
  const [busy, setBusy] = useState(false);

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
          seatsOf(riichi),
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
    { kind: "settlement", mode: "ron", deltas: preview?.deltas ?? null, summary },
    mirror,
  );

  const confirm = async () => {
    setBusy(true);
    const ok = await send({
      type: "ron",
      loser,
      wins: wins.map((w, i) => ({
        winner: w.winner,
        value: draftToClientValue(w.draft),
        ...(drafts[i]!.pao !== null ? { pao: drafts[i]!.pao! } : {}),
      })),
      riichi: seatsOf(riichi),
    });
    setBusy(false);
    if (ok) onDone();
  };

  const setWin = (i: number, patch: Partial<RonWinDraftState>) =>
    setWins(wins.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  /** 评估结果异步回来时用函数式更新，避免覆盖期间的改动 */
  const updateDraft = (i: number, update: (d: ValueDraft) => ValueDraft) =>
    setWins((ws) => ws.map((w, k) => (k === i ? { ...w, draft: update(w.draft) } : w)));

  return (
    <>
      <div className="space-y-3">
        <SeatSelect label="放铳者" names={names} value={loser} onChange={setLoser} />
        {wins.map((w, i) => (
          <div key={i} className="rounded-lg border border-border p-2.5">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SeatSelect
                  label={`荣和者${wins.length > 1 ? ` ${i + 1}` : ""}`}
                  names={names}
                  value={w.winner}
                  onChange={(winner) => setWin(i, { winner })}
                  exclude={[loser]}
                />
              </div>
              {wins.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWins(wins.filter((_, k) => k !== i))}
                >
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
              />
            </div>
            {drafts[i]!.paoAllowed && (
              <div className="mt-2">
                <PaoPicker
                  names={names}
                  winner={w.winner}
                  value={w.pao}
                  onChange={(pao) => setWin(i, { pao })}
                />
              </div>
            )}
          </div>
        ))}
        {wins.length < maxWins && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setWins([
                ...wins,
                {
                  winner: SEATS.find((s) => s !== loser && !wins.some((w) => w.winner === s)) ?? 0,
                  draft: createValueDraft(false),
                  pao: null,
                },
              ])
            }
          >
            添加荣和者（{rules.win.multiRon === "double" ? "双响" : "三响"}）
          </Button>
        )}
        {!distinct && (
          <p className="text-xs text-neg">荣和者与放铳者不能是同一人，荣和者之间不能重复</p>
        )}
        <SeatFlags label="立直情况" names={names} value={riichi} onChange={setRiichi} />
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
