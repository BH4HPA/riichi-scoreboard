import type { RoomRules, UiState } from "@riichi/core";
import { PreviewGrid } from "@/features/settlement/PreviewGrid";
import { ReferenceSheet } from "@/features/reference/ReferenceSheet";
import { RulesSummary } from "@/features/rules/RulesEditor";
import { Badge } from "@/ui/controls";

const MODE_LABELS = {
  tsumo: "自摸结算",
  ron: "荣和结算",
  draw: "流局结算",
  abortive: "途中流局",
  chombo: "错和罚符",
} as const;

/** 电视镜像：显示最近活跃的手机端意图。返回 null 表示无镜像。 */
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

  return (
    <div className="rounded-xl border border-accent/60 bg-surface p-4 shadow-lg shadow-accent/10">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Badge tone="accent">{who}</Badge>
        {intent.kind === "settlement" && <span>正在录入{MODE_LABELS[intent.mode]}</span>}
        {intent.kind === "rules" && <span>正在查看规则</span>}
        {intent.kind === "adjust" && <span>正在调整场况</span>}
      </div>
      {intent.kind === "settlement" && (
        <div className="mt-3 space-y-2">
          {intent.deltas ? (
            <PreviewGrid deltas={intent.deltas} names={names} />
          ) : (
            <p className="text-sm text-muted">填写中…</p>
          )}
          {intent.summary && <p className="text-sm">{intent.summary}</p>}
        </div>
      )}
      {intent.kind === "rules" && (
        <div className="mt-3">
          <RulesSummary rules={rules} />
        </div>
      )}
    </div>
  );
}
