import type { ReactNode } from "react";
import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { presetNameOf, WIND_LABELS, type RoomRules, type Wind } from "@riichi/core";
import { Button } from "@/ui/button";
import { ChipGroup, Label } from "@/ui/controls";

/** 场况：房间里这些来自牌局，这里由用户自己给。 */
export interface CalcContext {
  roundWind: Wind;
  /** 和牌者自风：东 = 庄家 */
  seatWind: Wind;
  honba: number;
}

const WIND_OPTIONS = WIND_LABELS.map((label, i) => ({ value: i as Wind, label }));
const WIN_OPTIONS = [
  { value: "ron", label: "荣和" },
  { value: "tsumo", label: "自摸" },
] as const;
const MAX_HONBA = 20;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <Label className="shrink-0">{label}</Label>
      {children}
    </div>
  );
}

/** 场风、自风、本场、荣和/自摸与规则：照片里认不出、却决定番符和点数的那些信息。 */
export function CalcContextCard({
  context,
  onContextChange,
  tsumo,
  onTsumoChange,
  rules,
  onEditRules,
}: {
  context: CalcContext;
  onContextChange: (next: CalcContext) => void;
  tsumo: boolean;
  onTsumoChange: (tsumo: boolean) => void;
  rules: RoomRules;
  onEditRules: () => void;
}) {
  const set = (patch: Partial<CalcContext>) => onContextChange({ ...context, ...patch });
  return (
    <section className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <Row label="场风">
        <ChipGroup
          value={context.roundWind}
          onChange={(roundWind) => set({ roundWind })}
          options={WIND_OPTIONS}
        />
      </Row>
      <Row label="自风（东为庄）">
        <ChipGroup
          value={context.seatWind}
          onChange={(seatWind) => set({ seatWind })}
          options={WIND_OPTIONS}
        />
      </Row>
      <Row label="本场">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="本场减一"
            disabled={context.honba <= 0}
            onClick={() => set({ honba: context.honba - 1 })}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center tabular" data-testid="calc-honba">
            {context.honba}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="本场加一"
            disabled={context.honba >= MAX_HONBA}
            onClick={() => set({ honba: context.honba + 1 })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Row>
      <Row label="和牌">
        <ChipGroup
          value={tsumo ? "tsumo" : "ron"}
          onChange={(v) => onTsumoChange(v === "tsumo")}
          options={[...WIN_OPTIONS]}
        />
      </Row>
      <Row label="规则">
        <Button variant="outline" size="sm" onClick={onEditRules}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {presetNameOf(rules)}
        </Button>
      </Row>
    </section>
  );
}
