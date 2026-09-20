import type { TenStage } from "@riichi/core";
import { cn } from "@/lib/utils";

const STEPS: Record<TenStage["kind"], { title: string; steps: string[] }> = {
  A: {
    title: "Stage A · 现在该做什么",
    steps: [
      "照常摸牌、打牌，可以吃、碰、杠。",
      "先听牌（有役）的一方在自己的手机上按「▶ 立直」或「听牌宣言」，成为进攻方。",
      "18 巡都没有人宣言：记「无人宣言流局」。",
    ],
  },
  B: {
    title: "Stage B · 现在该做什么",
    steps: [
      "防守方在手机上指定 2 张牌，进攻方回答：听的牌里有没有。",
      "有 → 记「被猜中」，流局。",
      "没有 → 进攻方从牌山连摸 5 张：摸到和牌张就记「自摸和」，没摸到就再指定 2 张。",
      "摸到王牌（留 14 张）还没有结果：记「王牌流局」。",
    ],
  },
};

/**
 * 电视上的流程提示：大家对《天》规则不熟，对局中把「这个阶段该做什么」常驻在得分卡下面。
 * 完整的规则说明在手机的「规则」页，可以投上来。
 */
export function TenStageHint({ stage, tv = false }: { stage: TenStage; tv?: boolean }) {
  const { title, steps } = STEPS[stage.kind];
  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-testid="ten-stage-hint"
    >
      <h2 className={cn("font-medium text-muted", tv ? "text-base" : "text-sm")}>{title}</h2>
      <ol className={cn("mt-2 list-decimal space-y-1.5 pl-5", tv ? "text-xl" : "text-sm")}>
        {steps.map((step) => (
          <li key={step} className="leading-relaxed">
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}
