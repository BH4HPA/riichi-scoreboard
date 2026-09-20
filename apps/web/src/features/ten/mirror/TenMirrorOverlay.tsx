import type { RoomRules, UiState } from "@riichi/core";
import { MirrorOverlay } from "@/features/mirror/MirrorOverlay";
import { TenGuideMirror } from "../guide/TenGuideMirror";
import { TenSettlementMirror } from "./TenSettlementMirror";

/** 二人房对局中的电视镜像：自己的两种意图在这里接，番符表 / 规则卡沿用四人房那一层。 */
export function TenMirrorOverlay({
  intents,
  names,
  rules,
}: {
  intents: UiState[];
  names: string[];
  rules: RoomRules;
}) {
  const latest = intents[0];
  if (latest?.intent.kind === "tenSettlement") {
    return <TenSettlementMirror state={latest} intent={latest.intent} names={names} />;
  }
  if (latest?.intent.kind === "tenGuide") return <TenGuideMirror intents={intents} names={names} />;
  return <MirrorOverlay intents={intents} names={names} rules={rules} />;
}
