import { cn } from "@/lib/utils";

const AUTHOR = { name: "Ray", since: 2014, url: "https://r-ay.cn" };
const ICP = { number: "浙ICP备2022018560号-2", url: "https://beian.miit.gov.cn/" };

// 新窗口打开：主屏应用（standalone）里点开交给系统浏览器，不把计分页顶掉
const external = { target: "_blank", rel: "noreferrer" } as const;
const link = "text-xs text-muted underline-offset-2 hover:underline";

export function Copyright({ className }: { className?: string }) {
  return (
    <a href={AUTHOR.url} {...external} className={cn(link, className)}>
      © {AUTHOR.name} {AUTHOR.since}-{new Date().getFullYear()}
    </a>
  );
}

export function IcpRecord({ className }: { className?: string }) {
  return (
    <a href={ICP.url} {...external} className={cn(link, className)}>
      {ICP.number}
    </a>
  );
}
