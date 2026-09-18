import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/ui/dialog";

/** 结算对话框的外壳：表单以 render prop 接收 onDone，关闭即卸载表单。 */
export function SettlementDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: (onDone: () => void) => ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {children(() => onOpenChange(false))}
      </DialogContent>
    </Dialog>
  );
}
