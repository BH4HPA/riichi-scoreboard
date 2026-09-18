import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;

/**
 * 对话框内容。默认：手机底部弹层 / 桌面居中卡；`side="right"`：右侧抽屉（历史记录等长列表）。
 */
export function DialogContent({
  className,
  children,
  title,
  description,
  side,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: ReactNode;
  description?: ReactNode;
  side?: "right";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-surface text-fg shadow-2xl outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-[min(600px,92vw)] animate-drawer-in"
            : "bottom-0 left-0 max-h-[92dvh] w-full rounded-t-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 truncate text-xs text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {/* 图标 16px 不变，负外边距把点击区撑到约 40px */}
          <DialogPrimitive.Close
            className="-m-3 rounded-md p-3 text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        {/* 底部留白不小于 iPhone 底部安全区，给在最后一个子元素上而不是滚动区自己的 padding：sticky 底栏才能贴到滚动区底边。
            底栏用 padding（留白要带着它的底色；这条选择器比它自己的 pb-* 优先级高），
            其余内容用 margin：自带边框的盒子（如空的历史记录）不会被改掉内边距、外沿贴到弹窗底 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 [&>*:last-child:not([data-dialog-footer])]:mb-[max(0.75rem,env(safe-area-inset-bottom))] [&>[data-dialog-footer]:last-child]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * 底部操作栏：贴在滚动区底部，长表单滚到中段时按钮依然可见。
 * 负外边距必须与上面滚动区的 `px-4` 一致，才能贴边且不产生横向滚动。
 */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-dialog-footer
      className={cn(
        "sticky bottom-0 -mx-4 mt-4 flex flex-row justify-end gap-2 border-t border-border bg-surface px-4 pt-3",
        className,
      )}
      {...props}
    />
  );
}
