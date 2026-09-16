import { QRCodeSVG } from "qrcode.react";
import { QrCode } from "lucide-react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { cn } from "@/lib/utils";
import { SiteBrand } from "@/features/site/SiteFooter";

function joinUrl(code: string): string {
  return `${window.location.origin}/r/${code}`;
}

/** 二维码 + 房间码 + 链接。宽屏大厅直接放左栏；其余场合放弹窗。 */
export function RoomQr({
  code,
  size = 240,
  className,
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  const url = joinUrl(code);
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="rounded-2xl bg-white p-3">
        <QRCodeSVG value={url} size={size} level="M" />
      </div>
      <div className="text-center">
        <div className="text-sm text-muted">房间码</div>
        <div className="text-4xl font-semibold tabular tracking-[0.25em]" data-testid="room-code">
          {code}
        </div>
        <div className="mt-1 text-sm text-muted">{url}</div>
      </div>
    </div>
  );
}

/** 按钮 + 弹窗：窄屏大厅与主控台对局页。 */
export function RoomQrDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        <QrCode className="h-4 w-4" /> 二维码
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title="扫码加入"
          description="手机扫码或在首页输入房间码"
          className="sm:max-w-sm"
        >
          <SiteBrand className="justify-center pt-1" />
          <RoomQr code={code} size={200} className="py-2" />
        </DialogContent>
      </Dialog>
    </>
  );
}
