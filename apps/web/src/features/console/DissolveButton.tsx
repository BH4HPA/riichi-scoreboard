import { useState } from "react";
import { XCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/ui/button";
import { useCommand } from "@/ws/useRoom";
import { ConfirmDialog } from "@/features/settlement/OtherDialogs";

/** 解散房间：二次确认后发命令；服务端随后断开所有连接，主控台收到断开后自动建新房。 */
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
  const send = useCommand();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <XCircle className="h-4 w-4" /> 解散房间
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`解散房间 ${code}？`}
        description="所有手机会被断开，进行中的对局不再记录战绩；主控台会自动创建新房间。"
        confirmText="解散"
        danger
        onConfirm={() => send({ type: "dissolve" })}
      />
    </>
  );
}
