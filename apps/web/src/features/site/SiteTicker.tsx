import { cn } from "@/lib/utils";
import { ICP } from "./site";
import { SiteBrand } from "./SiteFooter";

/** 手机对局底栏右侧：备案号与「Logo + 站名」每 10 秒淡出再淡入轮换；没配备案号时只有站名，不轮换。 */
export function SiteTicker({ className }: { className?: string }) {
  const brand = (
    <SiteBrand
      className="gap-1 whitespace-nowrap text-[11px] font-medium"
      iconClassName="h-3.5 w-3.5 rounded"
    />
  );
  if (!ICP) return <span className={className}>{brand}</span>;
  // 两层叠在同一格：宽度取较宽者，轮换时左边不抖。窄屏又断线时位置不够：列宽可缩到 0（minmax），
  // 备案号层撑满才出省略号（grid 子项默认按内容定宽），站名层裁掉尾部，都不去挤房间号和连接状态
  return (
    <span className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)]", className)}>
      <span className="animate-site-ticker col-start-1 row-start-1 w-full truncate text-right">
        {ICP.number}
      </span>
      <span
        className="animate-site-ticker-alt col-start-1 row-start-1 max-w-full justify-self-end overflow-hidden opacity-0"
        aria-hidden
      >
        {brand}
      </span>
    </span>
  );
}
