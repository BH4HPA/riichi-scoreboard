import {
  calcBasePoints,
  FU_BASE,
  FU_MELDS,
  FU_NOTES,
  FU_PAIR,
  FU_WAIT,
  formatPoints,
  POINT_TABLE_FU,
  POINT_TABLE_HAN,
  roundUpToHundred,
  YAKU_TABLE_SECTIONS,
  type RoomRules,
} from "@riichi/core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/controls";
import { cn } from "@/lib/utils";

export type ReferenceTab = "yaku" | "fu" | "points";

function pointCell(base: number): string {
  const koRon = roundUpToHundred(base * 4);
  const oyaRon = roundUpToHundred(base * 6);
  const koTsumo = `${formatPoints(roundUpToHundred(base))}/${formatPoints(roundUpToHundred(base * 2))}`;
  const oyaTsumo = `${formatPoints(roundUpToHundred(base * 2))} all`;
  return `${formatPoints(koRon)} · ${formatPoints(oyaRon)}\n${koTsumo} · ${oyaTsumo}`;
}

export function ReferenceSheet({
  rules,
  tab,
  onTabChange,
  tv = false,
}: {
  rules: RoomRules;
  tab: ReferenceTab;
  onTabChange?: ((t: ReferenceTab) => void) | undefined;
  tv?: boolean;
}) {
  const limits: Array<[string, number]> = [
    ["满贯", 2000],
    ["跳满", 3000],
    ["倍满", 4000],
    ["三倍满", 6000],
    ["役满", 8000],
  ];
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange?.(v as ReferenceTab)}
      className={cn(tv && "text-lg")}
    >
      <TabsList className="w-full">
        <TabsTrigger value="yaku" className="flex-1">
          役种
        </TabsTrigger>
        <TabsTrigger value="fu" className="flex-1">
          符数
        </TabsTrigger>
        <TabsTrigger value="points" className="flex-1">
          点数表
        </TabsTrigger>
      </TabsList>

      <TabsContent value="yaku" className="mt-3">
        <div className={cn("grid gap-3", tv ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
          {YAKU_TABLE_SECTIONS.map((section) => (
            <section key={section.title} className="rounded-lg border border-border">
              <h4 className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">
                {section.title}
              </h4>
              <table className="w-full text-sm">
                <tbody>
                  {section.items.map((y) => (
                    <tr key={y.id} className="border-t border-border first:border-t-0">
                      <td className="px-3 py-1">
                        <div>{y.name}</div>
                        {y.note && <div className="text-[11px] text-muted">{y.note}</div>}
                      </td>
                      <td className="px-3 py-1 text-right tabular text-muted">
                        {y.yakuman > 0
                          ? y.yakuman > 1
                            ? `${y.yakuman}倍役满`
                            : "役满"
                          : y.open === null
                            ? `${y.closed} 番（门清）`
                            : y.open === y.closed
                              ? `${y.closed} 番`
                              : `${y.closed} / 副露 ${y.open} 番`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="fu" className="mt-3">
        <div className={cn("grid gap-3", tv ? "grid-cols-2" : "grid-cols-1")}>
          <FuList title="基础" items={FU_BASE} />
          <section className="rounded-lg border border-border">
            <h4 className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">
              面子
            </h4>
            <table className="w-full text-sm">
              <thead className="text-[11px] text-muted">
                <tr>
                  <th className="px-3 py-1 text-left font-medium"></th>
                  <th className="px-2 py-1 text-right font-medium">中张明</th>
                  <th className="px-2 py-1 text-right font-medium">中张暗</th>
                  <th className="px-2 py-1 text-right font-medium">幺九明</th>
                  <th className="px-2 py-1 text-right font-medium">幺九暗</th>
                </tr>
              </thead>
              <tbody>
                {FU_MELDS.map((m) => (
                  <tr key={m.item} className="border-t border-border">
                    <td className="px-3 py-1">{m.item}</td>
                    <td className="px-2 py-1 text-right tabular">{m.openSimple}</td>
                    <td className="px-2 py-1 text-right tabular">{m.closedSimple}</td>
                    <td className="px-2 py-1 text-right tabular">{m.openTerminal}</td>
                    <td className="px-2 py-1 text-right tabular">{m.closedTerminal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <FuList title="雀头" items={FU_PAIR} />
          <FuList title="听牌形" items={FU_WAIT} />
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {FU_NOTES.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      </TabsContent>

      <TabsContent value="points" className="mt-3">
        <p className="mb-2 text-xs text-muted">
          每格：闲家荣和 · 庄家荣和 / 闲家自摸（闲付/庄付）· 庄家自摸。
          {rules.scoring.kiriageMangan ? "含切上满贯。" : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead className="text-muted">
              <tr>
                <th className="px-2 py-1 text-left font-medium">符 \ 番</th>
                {POINT_TABLE_HAN.map((h) => (
                  <th key={h} className="px-2 py-1 text-right font-medium">
                    {h} 番
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POINT_TABLE_FU.map((fu) => (
                <tr key={fu} className="border-t border-border">
                  <td className="px-2 py-1 tabular">{fu} 符</td>
                  {POINT_TABLE_HAN.map((han) => {
                    if ((fu === 20 && han === 1) || (fu === 25 && han === 1))
                      return (
                        <td key={han} className="px-2 py-1 text-right text-muted">
                          —
                        </td>
                      );
                    const base = calcBasePoints({ han, fu, yakuman: 0 }, rules);
                    return (
                      <td
                        key={han}
                        className={cn(
                          "whitespace-pre px-2 py-1 text-right tabular",
                          base >= 2000 && "text-accent",
                        )}
                      >
                        {pointCell(base)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {limits.map(([label, base]) => (
                <tr key={label} className="border-t border-border">
                  <td className="px-2 py-1">{label}</td>
                  <td colSpan={4} className="whitespace-pre px-2 py-1 text-right tabular">
                    {pointCell(base)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function FuList({
  title,
  items,
}: {
  title: string;
  items: Array<{ item: string; fu: string; note?: string }>;
}) {
  return (
    <section className="rounded-lg border border-border">
      <h4 className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">{title}</h4>
      <table className="w-full text-sm">
        <tbody>
          {items.map((r) => (
            <tr key={r.item} className="border-t border-border first:border-t-0">
              <td className="px-3 py-1">
                <div>{r.item}</div>
                {r.note && <div className="text-[11px] text-muted">{r.note}</div>}
              </td>
              <td className="px-3 py-1 text-right tabular">{r.fu}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
