import { useState } from "react";
import type { RoomKind, RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { RulesEditor } from "./RulesEditor";

/** 大厅里改规则的弹窗：每次打开从房间当前规则起草，「应用规则」成功才关闭。 */
export function RulesDialog({
  open,
  onOpenChange,
  rules,
  description,
  className,
  kind,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: RoomRules;
  description: string;
  className?: string;
  /** 房型（见 RulesEditor） */
  kind?: RoomKind | undefined;
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
            kind={kind}
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
  kind,
  onCancel,
  onApply,
}: {
  rules: RoomRules;
  kind: RoomKind | undefined;
  onCancel: () => void;
  onApply: (rules: RoomRules) => Promise<void>;
}) {
  const [draft, setDraft] = useState(rules);
  return (
    <>
      <RulesEditor value={draft} onChange={setDraft} editable kind={kind} />
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
