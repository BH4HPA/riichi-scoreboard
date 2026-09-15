import {
  FU_BASE,
  FU_MELD_SAMPLES,
  FU_MELDS,
  FU_PAIR,
  FU_ROUNDING,
  FU_SPECIALS,
  FU_STATE,
  FU_WAIT,
  type FuLine,
} from "@riichi/core";
import { TileFace } from "@/features/hand/TileFace";
import { cn } from "@/lib/utils";

function Card({
  title,
  children,
  className,
  tv,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  tv: boolean;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border border-border bg-surface", className)}>
      <h4
        className={cn(
          "rounded-t-xl bg-surface-2 px-3 py-1.5 text-center font-medium text-accent",
          tv ? "text-base" : "text-xs",
        )}
      >
        {title}
      </h4>
      <div className="flex flex-1 flex-col justify-center px-3 py-2">{children}</div>
    </section>
  );
}

function Lines({ lines, tv }: { lines: FuLine[]; tv: boolean }) {
  return (
    <ul className={cn("space-y-1.5", tv ? "text-base" : "text-sm")}>
      {lines.map((l) => (
        <li key={l.item} className="flex items-baseline justify-between gap-3">
          <span>
            {l.item}
            {l.note && <span className="ml-1 text-[11px] text-muted">{l.note}</span>}
          </span>
          <span className="font-semibold tabular">{l.fu}</span>
        </li>
      ))}
    </ul>
  );
}

function Plus({ tv }: { tv: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center font-semibold text-muted",
        tv ? "text-2xl" : "text-lg",
      )}
      aria-hidden
    >
      +
    </div>
  );
}

/** 符数计算：底符 + 面子 + 雀头 + 听牌形 + 和牌状态，再向上取整；三条特例。 */
export function FuFormula({ tv }: { tv: boolean }) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "grid gap-2",
          tv ? "grid-cols-[1fr_auto_2fr_auto_1fr_auto_1fr_auto_1fr]" : "grid-cols-1",
        )}
      >
        <Card title="底符" tv={tv}>
          <div className="text-center">
            <div className={cn("text-muted", tv ? "text-sm" : "text-xs")}>{FU_BASE.item}</div>
            <div className={cn("font-semibold tabular", tv ? "text-2xl" : "text-lg")}>
              {FU_BASE.fu}
            </div>
          </div>
        </Card>
        <Plus tv={tv} />
        <Card title="手牌 - 面子" tv={tv}>
          <table className={cn("w-full text-center", tv ? "text-base" : "text-sm")}>
            <thead>
              <tr className="text-muted">
                <th />
                <th className="pb-1 font-medium">
                  <div>中张牌</div>
                  <TileFace tile={FU_MELD_SAMPLES.simple} size="xs" />
                </th>
                <th className="pb-1 font-medium">
                  <div>幺九牌</div>
                  <TileFace tile={FU_MELD_SAMPLES.terminal} size="xs" />
                </th>
              </tr>
            </thead>
            <tbody>
              {FU_MELDS.map((m) => (
                <tr key={m.item} className="border-t border-border">
                  <td className="py-1 text-left">{m.item}</td>
                  <td className="py-1 font-semibold tabular">+{m.simple}</td>
                  <td className="py-1 font-semibold tabular">+{m.terminal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Plus tv={tv} />
        <Card title="手牌 - 雀头" tv={tv}>
          <Lines lines={FU_PAIR} tv={tv} />
        </Card>
        <Plus tv={tv} />
        <Card title="听牌形" tv={tv}>
          <Lines lines={FU_WAIT} tv={tv} />
        </Card>
        <Plus tv={tv} />
        <Card title="和牌状态" tv={tv}>
          <Lines lines={FU_STATE} tv={tv} />
        </Card>
      </div>
      <p className={cn("text-muted", tv ? "text-base" : "text-xs")}>{FU_ROUNDING}</p>
      <ul
        className={cn(
          "space-y-1 rounded-xl border border-border bg-surface px-3 py-2",
          tv ? "text-base" : "text-xs",
        )}
      >
        {FU_SPECIALS.map((s, i) => (
          <li key={s}>
            <span className="mr-1 font-medium text-accent">特例 {i + 1}：</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
