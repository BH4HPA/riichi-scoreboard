import { useState } from "react";
import {
  scoreTier,
  TIER_LABELS,
  yakumanLabel,
  type ClientWinValue,
  type EvaluatedHand,
  type HandInput,
  type HandValue,
  type RoomRules,
  type Seat,
} from "@riichi/core";
import { ChipGroup, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/controls";
import { useSocket } from "@/ws/useRoom";
import { useRoomStore } from "@/ws/store";
import { CommandError } from "@/ws/socket";
import { emptyHand, TileKeyboard } from "./TileKeyboard";

export interface ValueDraft {
  mode: "manual" | "hand";
  han: number;
  fu: number;
  yakuman: number;
  hand: HandInput;
  evaluated: EvaluatedHand | null;
}

export function createValueDraft(tsumo: boolean): ValueDraft {
  return { mode: "manual", han: 3, fu: 40, yakuman: 0, hand: emptyHand(tsumo), evaluated: null };
}

/** 草稿 → 可计算的番符值；牌面未评估或非和牌形时为 null。 */
export function draftValue(draft: ValueDraft): HandValue | null {
  if (draft.mode === "manual") return { han: draft.han, fu: draft.fu, yakuman: draft.yakuman };
  const e = draft.evaluated;
  return e && e.isAgari ? { han: e.han, fu: e.fu, yakuman: e.yakuman } : null;
}

export function draftToClientValue(draft: ValueDraft): ClientWinValue {
  if (draft.mode === "manual")
    return { kind: "manual", han: draft.han, fu: draft.fu, yakuman: draft.yakuman };
  return { kind: "hand", hand: draft.hand };
}

const HAN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => ({
  value: n,
  label: n,
}));
const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((n) => ({
  value: n,
  label: n,
}));

export function ValuePicker({
  draft,
  onChange,
  rules,
  seat,
}: {
  draft: ValueDraft;
  onChange: (d: ValueDraft) => void;
  rules: RoomRules;
  seat: Seat;
}) {
  const socket = useSocket();
  const notify = useRoomStore((s) => s.notify);
  const [evaluating, setEvaluating] = useState(false);
  const manualValue: HandValue = { han: draft.han, fu: draft.fu, yakuman: draft.yakuman };
  const tier = scoreTier(manualValue, rules);
  const maxYakuman = rules.scoring.yakumanStacking ? 6 : 1;

  const evaluate = async () => {
    setEvaluating(true);
    try {
      const evaluated = await socket.evaluate(seat, draft.hand);
      onChange({ ...draft, evaluated });
    } catch (err) {
      notify("error", err instanceof CommandError ? err.message : "计算失败");
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <Tabs
      value={draft.mode}
      onValueChange={(v) => onChange({ ...draft, mode: v as ValueDraft["mode"] })}
    >
      <TabsList className="w-full">
        <TabsTrigger value="manual" className="flex-1">
          番符
        </TabsTrigger>
        <TabsTrigger value="hand" className="flex-1">
          牌面
        </TabsTrigger>
      </TabsList>
      <TabsContent value="manual" className="mt-3 space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <Label>番数</Label>
            {draft.yakuman === 0 && TIER_LABELS[tier] && (
              <span className="text-xs text-accent">{TIER_LABELS[tier]}</span>
            )}
          </div>
          <ChipGroup
            value={draft.yakuman === 0 ? draft.han : null}
            onChange={(han) => onChange({ ...draft, han, yakuman: 0 })}
            options={HAN_OPTIONS}
            className="mt-1"
          />
        </div>
        <div>
          <Label>符数</Label>
          <ChipGroup
            value={draft.yakuman === 0 ? draft.fu : null}
            onChange={(fu) => onChange({ ...draft, fu, yakuman: 0 })}
            options={FU_OPTIONS}
            className="mt-1"
          />
        </div>
        <div>
          <Label>役满</Label>
          <ChipGroup
            value={draft.yakuman || null}
            onChange={(yakuman) => onChange({ ...draft, yakuman })}
            options={Array.from({ length: maxYakuman }, (_, i) => ({
              value: i + 1,
              label: yakumanLabel(i + 1),
            }))}
            className="mt-1"
          />
        </div>
      </TabsContent>
      <TabsContent value="hand" className="mt-3">
        <TileKeyboard
          hand={draft.hand}
          onChange={(hand) => onChange({ ...draft, hand, evaluated: null })}
          rules={rules}
          evaluated={draft.evaluated}
          evaluating={evaluating}
          onEvaluate={evaluate}
        />
      </TabsContent>
    </Tabs>
  );
}
