import type { HandInput, RoomRules } from "@riichi/core";
import { Chip } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { firstTakeLabel } from "./firstTake";
import { withRiichi } from "./handEdits";

interface Flag {
  key: keyof HandInput;
  label: string;
  /** 依赖立直的旗标在未立直时不可点 */
  needsRiichi?: boolean;
}

/**
 * 一发、海底、抢杠、天和这些信息**照片里根本不存在**，模型永远认不出来。
 * 所以确认态收起键盘之后，这一行必须常驻、不可折叠，否则界面越干净漏勾越多。
 * 立直由识别里宝自动勾上时带记号，让「为什么亮着」看得见。
 */
export function FlagChips({
  hand,
  rules,
  riichiAuto,
  isDealer,
  onChange,
}: {
  hand: HandInput;
  rules: RoomRules;
  riichiAuto: boolean;
  /** 和牌者是否庄家；不在房间里（算点数页）为 null */
  isDealer: boolean | null;
  onChange: (next: HandInput) => void;
}) {
  const flags: Flag[] = [
    { key: "riichi", label: "立直" },
    { key: "doubleRiichi", label: "两立直", needsRiichi: true },
    ...(rules.hand.ippatsu ? [{ key: "ippatsu" as const, label: "一发", needsRiichi: true }] : []),
    { key: "afterKan", label: hand.tsumo ? "岭上开花" : "抢杠" },
    { key: "lastTile", label: hand.tsumo ? "海底捞月" : "河底捞鱼" },
    { key: "firstTake", label: firstTakeLabel(hand.tsumo, isDealer) },
  ];

  const toggle = (f: Flag) => {
    const on = !hand[f.key];
    onChange(f.key === "riichi" ? withRiichi(hand, on) : { ...hand, [f.key]: on });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {flags.map((f) => {
        const auto = f.key === "riichi" && riichiAuto && hand.riichi;
        return (
          <Chip
            key={String(f.key)}
            pressed={Boolean(hand[f.key])}
            disabled={f.needsRiichi && !hand.riichi}
            onClick={() => toggle(f)}
            className={cn("relative", auto && "pr-3.5")}
          >
            {f.label}
            {auto && (
              <span
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent-fg"
                aria-hidden
              />
            )}
          </Chip>
        );
      })}
    </div>
  );
}
