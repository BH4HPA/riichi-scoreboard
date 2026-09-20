import type { TenStage } from "@riichi/core";
import { cn } from "@/lib/utils";

const STEPS: Record<TenStage["kind"], { title: string; steps: string[] }> = {
  A: {
    title: "Stage A",
    steps: [
      "照常摸打，可以吃、碰、杠。",
      "先听牌的一方按「▶ 立直」或「听牌宣言」。",
      "18 巡无人宣言：记「流局」。",
    ],
  },
  B: {
    title: "Stage B",
    steps: [
      "防守方指定 2 张牌，进攻方回答有没有。",
      "有：记「被猜中」。",
      "没有：进攻方连摸 5 张，摸到就记「自摸」，否则再指定 2 张。",
      "摸到王牌仍无结果：记「流局」。",
    ],
  },
};

/**
 * 电视上的流程提示：大家对《天》规则不熟，对局中把「这个阶段该做什么」常驻在得分卡下面。
 * 完整的玩法说明：手机在「规则」页（可以投上来），主控台在「操作」里。
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
