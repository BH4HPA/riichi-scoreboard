import { cn } from "@/lib/utils";

const AUTHOR = { name: "Ray", since: 2014, url: "https://r-ay.cn" };
const ICP = { number: "浙ICP备2022018560号-2", url: "https://beian.miit.gov.cn/" };

// 新窗口打开：主屏应用（standalone）里点开交给系统浏览器，不把计分页顶掉
const external = { target: "_blank", rel: "noreferrer" } as const;
const link = "underline-offset-2 hover:underline";

/** 版权 + 备案号，一行两段（窄了自动换行）；对齐方式由调用方给。 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted", className)}>
      <a href={AUTHOR.url} {...external} className={link}>
        © {AUTHOR.name} {AUTHOR.since}-{new Date().getFullYear()}
      </a>
      <a href={ICP.url} {...external} className={link}>
        {ICP.number}
      </a>
    </footer>
  );
}
