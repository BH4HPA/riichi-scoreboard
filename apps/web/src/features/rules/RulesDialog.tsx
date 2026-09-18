import { useState, type ReactNode } from "react";
import type { RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { RulesEditor } from "./RulesEditor";

/**
 * 大厅里改规则的弹窗：每次打开从房间当前规则起草，「应用规则」成功才关闭。
 * `header` 放在编辑器上方（手机端的「投到电视」开关）。
 */
export function RulesDialog({
  open,
  onOpenChange,
  rules,
  description,
  header,
  className,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: RoomRules;
  description: string;
  header?: ReactNode;
  className?: string;
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
            header={header}
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
  header,
  onCancel,
  onApply,
}: {
  rules: RoomRules;
  header: ReactNode;
  onCancel: () => void;
  onApply: (rules: RoomRules) => Promise<void>;
}) {
  const [draft, setDraft] = useState(rules);
  return (
    <>
      {header}
      <RulesEditor value={draft} onChange={setDraft} editable />
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
