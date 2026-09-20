import {
  TEN_DRAW_LABELS,
  tenDeclareLabel,
  type RoomRules,
  type TenDrawReason,
  type TenGameState,
} from "@riichi/core";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { useCommand } from "@/ws/useRoom";
import { DissolveDialog } from "@/features/console/DissolveButton";
import { useMirror } from "@/features/mirror/useMirror";
import { TenGuideDialog } from "../guide/TenGuideDialog";
import { useCloseOnStale } from "@/features/settlement/drafts/useCloseOnStale";
import { TenTsumoDialog } from "./TenTsumoDialog";
import type { TenDialog } from "./useTenDialogs";

const DRAWS: readonly TenDrawReason[] = ["noDeclare", "guessed", "exhausted"];

function drawDescription(reason: TenDrawReason, game: TenGameState, names: string[]): string {
  const after = "庄家不变，本场 +1。";
  const { stage } = game;
  if (reason === "noDeclare" || stage.kind !== "B") return `18 巡内没有人宣言。${after}`;
  const who = `${names[stage.attacker]}（${tenDeclareLabel(stage.riichi)}）`;
  return reason === "guessed"
    ? `防守方猜中了 ${who}的待牌。${after}`
    : `${who} 摸到王牌仍未和牌，也没有被猜中。${after}`;
}

/**
 * 流局确认：打开期间把「正在记哪种流局」镜像到电视。
 * 它写入一局的结果，所以盯着局面戳（见 `useCloseOnStale`）。
 */
function TenDrawConfirm({
  reason,
  open,
  onOpenChange,
  game,
  names,
  mirror,
}: {
  reason: TenDrawReason;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: TenGameState;
  names: string[];
  mirror: boolean;
}) {
  const send = useCommand();
  const submit = useCloseOnStale(() => onOpenChange(false), open);
  const description = drawDescription(reason, game, names);
  useMirror(
    open,
    {
      kind: "tenSettlement",
      mode: "draw",
      summary: `${TEN_DRAW_LABELS[reason]}：${description}`,
      gain: null,
      win: null,
    },
    mirror,
  );
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`记为「${TEN_DRAW_LABELS[reason]}」？`}
      description={description}
      confirmText="确认流局"
      onConfirm={() => submit(() => send({ type: "tenDraw", reason }))}
    />
  );
}

/** 二人房操作栏的全部对话框；`dissolveCode` 只有主控台传（解散确认）。 */
export function TenControlHost({
  dialog,
  onClose,
  game,
  names,
  rules,
  mirror,
  dissolveCode,
}: {
  dialog: TenDialog | null;
  onClose: () => void;
  game: TenGameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  dissolveCode?: string;
}) {
  const send = useCommand();
  const openOf = (key: TenDialog) => ({
    open: dialog === key,
    onOpenChange: (open: boolean) => {
      if (!open) onClose();
    },
  });
  const midRound = game.stage.kind === "B";

  return (
    <>
      <TenTsumoDialog
        {...openOf("tsumo")}
        game={game}
        names={names}
        rules={rules}
        mirror={mirror}
      />
      {DRAWS.map((reason) => (
        <TenDrawConfirm
          key={reason}
          reason={reason}
          {...openOf(reason)}
          game={game}
          names={names}
          mirror={mirror}
        />
      ))}
      <ConfirmDialog
        {...openOf("end")}
        title="现在终局？"
        description={
          midRound
            ? "这一局还没有记结果，不计入；按当前得分定胜负。此操作可撤销。"
            : "按当前得分定胜负。此操作可撤销。"
        }
        confirmText="确认终局"
        onConfirm={() => send({ type: "endGame" })}
      />
      <ConfirmDialog
        {...openOf("newGame")}
        title="重开整场？"
        description={`${game.status === "finished" ? "" : "放弃眼下这一场。"}得分、立直棒与历史记录从头开始，1 小时重新计；座位与规则不变。此操作不可撤销。`}
        confirmText="确认重开"
        danger
        onConfirm={() => send({ type: "newGame" })}
      />
      <ConfirmDialog
        {...openOf("lobby")}
        title="返回大厅？"
        description="回到大厅后可以调整座位与规则。本场的得分与记录不会保留（二人麻将不计入个人战绩），需要的话请先截图。"
        confirmText="返回大厅"
        onConfirm={() => send({ type: "toLobby" })}
      />
      {/* 只用一台主控台 + 本地玩家时，对局中也得查得到玩法：主控台在本机直接看（不投屏） */}
      {dissolveCode && <TenGuideDialog {...openOf("guide")} castable={false} />}
      {dissolveCode && <DissolveDialog code={dissolveCode} {...openOf("dissolve")} />}
    </>
  );
}
