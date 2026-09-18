import { cn } from "@/lib/utils";
import { AUTHOR, ICP } from "./site";

// 新窗口打开：主屏应用（standalone）里点开交给系统浏览器，不把计分页顶掉
const external = { target: "_blank", rel: "noreferrer" } as const;
const link = "underline-offset-2 hover:underline";

/** 版权 + 备案号，一行两段（放不下折成两行）；对齐方式由调用方给。两项都没配置时不渲染。 */
export function SiteFooter({ className }: { className?: string }) {
  if (!AUTHOR && !ICP) return null;
  const year = new Date().getFullYear();
  const copyright = AUTHOR && (
    <>
      {/* PingFang 的 © 字形又小又偏上（Mac 上的 Chrome 按字体栈会用到它），单独交给系统西文字体；
          leading-none：换了字体的行高不同，会把这一段的行盒撑高，和备案号错开 */}
      <span className="font-[system-ui] leading-none">©</span> {AUTHOR.name}{" "}
      {AUTHOR.since && AUTHOR.since < year ? `${AUTHOR.since}-${year}` : year}
    </>
  );
  return (
    <footer
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted", className)}
    >
      {AUTHOR &&
        (AUTHOR.url ? (
          <a href={AUTHOR.url} {...external} className={link}>
            {copyright}
          </a>
        ) : (
          <span>{copyright}</span>
        ))}
      {ICP && (
        <a href={ICP.url} {...external} className={link}>
          {ICP.number}
        </a>
      )}
    </footer>
  );
}

/** Logo + 站名：宽屏主控台大厅左栏右下角、二维码弹窗顶部、拍照算点数页底部版权上方、手机对局底栏（`SiteTicker`，缩小）。 */
export function SiteBrand({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold", className)}>
      <img src="/icon-192.png" alt="" className={cn("h-7 w-7 rounded-lg", iconClassName)} />
      立直麻将计分板
    </span>
  );
}
