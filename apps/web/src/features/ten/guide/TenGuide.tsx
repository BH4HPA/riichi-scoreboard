import { useEffect, useRef } from "react";
import { TEN_GUIDE_PAGES } from "@riichi/core";
import { Tabs, TabsList, TabsTrigger } from "@/ui/controls";

/** 最近的滚动祖先：弹层的内容区自己滚动，「读到哪一节」要相对它来判 */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * 《天》二人麻将的规则说明。
 * 手机上不分页：五节竖着平铺，读到哪一节就把那一节报给 `onPageChange`——投到电视时电视跟着切页。
 * （手机宽度放不下五个标签，缩成 1–5 的序号又看不出是什么。）
 * 电视上（`tv`）一次只显示一节，顶上一排标签标出现在讲到哪儿；页由讲解者的手机决定。
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
  const container = useRef<HTMLDivElement>(null);
  const report = useRef(onPageChange);
  useEffect(() => {
    report.current = onPageChange;
  });
  useEffect(() => {
    const el = container.current;
    if (tv || !el) return;
    const root = scrollParent(el);
    const last = TEN_GUIDE_PAGES[TEN_GUIDE_PAGES.length - 1]!.key;
    const visible = new Set<string>();
    // 滚到底了就是最后一节：它排在末尾、往往不够长，永远够不着上面那条判定带，不补这一条它就投不上电视
    const atBottom = () =>
      root !== null && root.scrollTop + root.clientHeight >= root.scrollHeight - 8;
    const update = () => {
      const current = atBottom() ? last : TEN_GUIDE_PAGES.find((p) => visible.has(p.key))?.key;
      if (current) report.current?.(current);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.page!;
          if (e.isIntersecting) visible.add(key);
          else visible.delete(key);
        }
        // 视线落在内容区上部的那一节；两节同时压线时取靠前的
        update();
      },
      { root, rootMargin: "-15% 0px -55% 0px" },
    );
    for (const section of el.querySelectorAll<HTMLElement>("[data-page]")) {
      observer.observe(section);
    }
    root?.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      root?.removeEventListener("scroll", update);
    };
  }, [tv]);

  if (tv) {
    const current = TEN_GUIDE_PAGES.find((p) => p.key === page) ?? TEN_GUIDE_PAGES[0]!;
    return (
      <div className="space-y-6" data-testid="ten-guide">
        <Tabs value={current.key}>
          <TabsList className="h-11 w-full">
            {TEN_GUIDE_PAGES.map((p) => (
              <TabsTrigger key={p.key} value={p.key} disabled className="h-9 flex-1 px-1 text-base">
                {p.title.split("：")[0]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div>
          <h3 className="text-3xl font-semibold">{current.title}</h3>
          <p className="mt-1 text-2xl text-accent">{current.lead}</p>
        </div>
        <ol className="list-decimal space-y-4 pl-5 text-2xl">
          {current.items.map((item) => (
            <li key={item} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div ref={container} className="space-y-6" data-testid="ten-guide">
      {TEN_GUIDE_PAGES.map((p) => (
        <section key={p.key} data-page={p.key} aria-current={p.key === page || undefined}>
          <h3 className="text-base font-semibold">{p.title}</h3>
          <p className="mt-1 text-sm text-accent">{p.lead}</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
            {p.items.map((item) => (
              <li key={item} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
