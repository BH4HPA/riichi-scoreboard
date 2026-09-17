import { useEffect, useState } from "react";

/** 元素的实时高度（px）；元素未挂载时为 0 */
export function useElementHeight(el: HTMLElement | null): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(
        entry!.borderBoxSize?.[0]?.blockSize ?? entry!.target.getBoundingClientRect().height,
      ),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return height;
}
