import { useState } from "react";
import { XCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/ui/button";
import { useCommand } from "@/ws/useRoom";
import { ConfirmDialog } from "@/features/settlement/OtherDialogs";

/** 解散确认：发命令后服务端断开所有连接，主控台收到断开后自动建新房。 */
export function DissolveDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const send = useCommand();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`解散房间 ${code}？`}
      description="所有手机会被断开，进行中的对局不再记录战绩；主控台会自动创建新房间。"
      confirmText="解散"
      danger
      onConfirm={() => send({ type: "dissolve" })}
    />
  );
}

/** 大厅里的解散按钮（不在其它对话框内，按钮与确认框放一起）。 */
export function DissolveButton({
  code,
  size = "md",
  variant = "outline",
  className,
}: {
  code: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <XCircle className="h-4 w-4" /> 解散房间
      </Button>
      <DissolveDialog code={code} open={open} onOpenChange={setOpen} />
    </>
  );
}
