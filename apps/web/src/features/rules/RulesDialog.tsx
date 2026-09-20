import { useState } from "react";
import type { RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import type { RuleGroupKey } from "./fields";
import { RulesEditor } from "./RulesEditor";

/** 大厅里改规则的弹窗：每次打开从房间当前规则起草，「应用规则」成功才关闭。 */
export function RulesDialog({
  open,
  onOpenChange,
  rules,
  description,
  className,
  groups,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: RoomRules;
  description: string;
  className?: string;
  /** 只编辑这些分组（见 RulesEditor） */
  groups?: readonly RuleGroupKey[] | undefined;
  onApply: (rules: RoomRules) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="房间规则"
        description={description}
        {...(className ? { className } : {})}
      >
        {open && (
          <RulesForm
            rules={rules}
            groups={groups}
            onCancel={() => onOpenChange(false)}
            onApply={async (draft) => {
              if (await onApply(draft)) onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RulesForm({
  rules,
  groups,
  onCancel,
  onApply,
}: {
  rules: RoomRules;
  groups: readonly RuleGroupKey[] | undefined;
  onCancel: () => void;
  onApply: (rules: RoomRules) => Promise<void>;
}) {
  const [draft, setDraft] = useState(rules);
  return (
    <>
      <RulesEditor value={draft} onChange={setDraft} editable groups={groups} />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button variant="accent" onClick={() => onApply(draft)}>
          应用规则
        </Button>
      </DialogFooter>
    </>
  );
}
