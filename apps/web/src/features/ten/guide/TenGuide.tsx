import { TEN_GUIDE_PAGES } from "@riichi/core";
import { Tabs, TabsList, TabsTrigger } from "@/ui/controls";
import { cn } from "@/lib/utils";

/**
 * 《天》二人麻将的规则说明：分页标签 + 当前页的要点。手机上自己看，也用来投到电视给同桌的人讲
 * （`tv` 放大字号；电视端不传 `onPageChange`，页由讲解者的手机决定）。
 */
export function TenGuide({
  page,
  onPageChange,
  tv = false,
}: {
  page: string;
  onPageChange?: (page: string) => void;
  tv?: boolean;
}) {
  const current = TEN_GUIDE_PAGES.find((p) => p.key === page) ?? TEN_GUIDE_PAGES[0]!;
  return (
    <div className={cn("space-y-3", tv && "space-y-6")} data-testid="ten-guide">
      <Tabs value={current.key} onValueChange={(v) => onPageChange?.(v)}>
        <TabsList className={cn("w-full", tv && "h-11")}>
          {TEN_GUIDE_PAGES.map((p, i) => (
            <TabsTrigger
              key={p.key}
              value={p.key}
              disabled={!onPageChange}
              className={cn("flex-1 px-1", tv && "h-9 text-base")}
            >
              {/* 手机上五个标签放不下全名：只有当前页写全名，其余给序号 */}
              {tv || p.key === current.key ? p.title.split("：")[0] : i + 1}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div>
        <h3 className={cn("font-semibold", tv ? "text-3xl" : "text-base")}>{current.title}</h3>
        <p className={cn("mt-1 text-accent", tv ? "text-2xl" : "text-sm")}>{current.lead}</p>
      </div>
      <ol className={cn("list-decimal space-y-2 pl-5", tv ? "space-y-4 text-2xl" : "text-sm")}>
        {current.items.map((item) => (
          <li key={item} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}
