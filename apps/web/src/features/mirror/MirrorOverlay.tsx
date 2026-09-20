import { presetNameOf, type RoomRules, type UiState } from "@riichi/core";
import { ReferenceSheet } from "@/features/reference/ReferenceSheet";
import { RulesSummary } from "@/features/rules/RulesEditor";
import { Badge } from "@/ui/controls";
import { SettlementMirror } from "./SettlementMirror";

/**
 * 电视镜像：显示最近活跃的手机端意图。
 * 结算与番符表是全屏层；规则/调整场况是左栏一张小卡。返回 null 表示无镜像。
 */
export function MirrorOverlay({
  intents,
  names,
  rules,
}: {
  intents: UiState[];
  names: string[];
  rules: RoomRules;
}) {
  const latest = intents[0];
  if (!latest) return null;
  const who = latest.seat !== null ? names[latest.seat] : latest.name;
  const intent = latest.intent;

  if (intent.kind === "settlement") {
    return <SettlementMirror state={latest} intent={intent} names={names} />;
  }
  if (intent.kind === "reference") {
    return (
      <div className="fixed inset-0 z-30 overflow-y-auto bg-bg/95 p-6 backdrop-blur">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted">
          <Badge tone="accent">{who}</Badge> 正在查看番符表
        </div>
        <ReferenceSheet rules={rules} view={{ tab: intent.tab, sub: intent.sub }} tv />
      </div>
    );
  }

  if (intent.kind === "none") return null;
  // 二人房的镜像由二人房的对局页自己渲染（features/ten/mirror），四人房收不到这两种
  if (intent.kind === "tenSettlement" || intent.kind === "tenGuide") return null;
  const card: "rules" | "adjust" = intent.kind;

  return (
    <div className="rounded-xl border border-accent/60 bg-surface p-4 shadow-lg shadow-accent/10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Badge tone="accent">{who}</Badge>
        {card === "rules" && <span>正在查看规则 · {presetNameOf(rules)}</span>}
        {card === "adjust" && <span>正在调整场况</span>}
      </div>
      {card === "rules" && (
        <div className="mt-3">
          <RulesSummary rules={rules} />
        </div>
      )}
    </div>
  );
}
