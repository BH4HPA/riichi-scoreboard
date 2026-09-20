import type { UiState } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { TenGuide } from "./TenGuide";

/**
 * 电视上的规则说明镜像：大厅与对局中共用。取最近一个正在投规则说明的人（大厅里别人可能同时开着别的弹层）。
 * 盖在主控台自己的弹层之上（窄屏首次进大厅会自动弹二维码）：有人在讲规则时，电视就该显示规则。
 */
export function TenGuideMirror({ intents, names }: { intents: UiState[]; names: string[] }) {
  const state = intents.find((s) => s.intent.kind === "tenGuide");
  if (!state || state.intent.kind !== "tenGuide") return null;
  const who = state.seat !== null ? names[state.seat] : state.name;
  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-bg/95 p-8 backdrop-blur"
      data-testid="ten-guide-mirror"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          <Badge tone="accent">{who}</Badge> 正在讲解规则
        </div>
        <TenGuide page={state.intent.page} tv />
      </div>
    </div>
  );
}
