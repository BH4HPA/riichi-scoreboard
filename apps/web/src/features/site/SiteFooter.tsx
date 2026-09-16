import { cn } from "@/lib/utils";
import { AUTHOR, ICP } from "./site";

// 新窗口打开：主屏应用（standalone）里点开交给系统浏览器，不把计分页顶掉
const external = { target: "_blank", rel: "noreferrer" } as const;
const link = "underline-offset-2 hover:underline";

/** 版权 + 备案号，一行两段（放不下折成两行）；对齐方式由调用方给。 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted", className)}>
      <a href={AUTHOR.url} {...external} className={link}>
        {/* PingFang 的 © 字形又小又偏上（Mac 上的 Chrome 按字体栈会用到它），单独交给系统西文字体 */}
        <span className="font-[system-ui]">©</span> {AUTHOR.name} {AUTHOR.since}-
        {new Date().getFullYear()}
      </a>
      <a href={ICP.url} {...external} className={link}>
        {ICP.number}
      </a>
    </footer>
  );
}

/** Logo + 站名：宽屏主控台大厅左栏右下角、二维码弹窗顶部。 */
export function SiteBrand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold", className)}>
      <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
      立直麻将计分板
    </span>
  );
}
