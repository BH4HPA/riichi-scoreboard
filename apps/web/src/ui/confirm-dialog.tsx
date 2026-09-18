import { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter } from "./dialog";

/** 二次确认：onConfirm 返回 true 才关闭，返回 false（命令被拒）时留在原地。 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="sm:max-w-sm">
        <p className="text-sm text-muted">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={danger ? "danger" : "accent"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onConfirm();
              setBusy(false);
              if (ok) onOpenChange(false);
            }}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
