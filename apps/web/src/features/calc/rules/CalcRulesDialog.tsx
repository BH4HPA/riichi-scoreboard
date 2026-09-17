import { useState } from "react";
import { RulesError, validateRules, type RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { RulesEditor } from "@/features/rules/RulesEditor";
import { useRoomStore } from "@/ws/store";

/** 规则弹窗：编辑一份副本，「应用」时校验通过才生效（这里没有服务端 setRules 兜底）。 */
export function CalcRulesDialog({
  open,
  onOpenChange,
  rules,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: RoomRules;
  onApply: (rules: RoomRules) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="规则" description="只影响本页的番符与点数，本机会记住。">
        {/* 弹窗关闭时内容卸载：每次打开都从当前规则重新起一份副本 */}
        <RulesForm
          initial={rules}
          onCancel={() => onOpenChange(false)}
          onApply={(next) => {
            onApply(next);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function RulesForm({
  initial,
  onCancel,
  onApply,
}: {
  initial: RoomRules;
  onCancel: () => void;
  onApply: (rules: RoomRules) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const notify = useRoomStore((s) => s.notify);
  const apply = () => {
    try {
      onApply(validateRules(draft));
    } catch (err) {
      notify("error", err instanceof RulesError ? err.message : "规则格式错误");
    }
  };
  return (
    <>
      <RulesEditor value={draft} onChange={setDraft} editable />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button variant="accent" onClick={apply}>
          应用规则
        </Button>
      </DialogFooter>
    </>
  );
}
