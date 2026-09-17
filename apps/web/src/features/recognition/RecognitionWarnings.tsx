import type { RecognitionWarning } from "@riichi/core";

/**
 * 识别结果里用户此刻能动手的提示（blocking）：房间结算与拍照算点数页共用。
 * 结果自洽时模型的内务（丢了几个低置信框之类）对用户零价值，info 级不在这里出现。
 */
export function RecognitionWarnings({ warnings }: { warnings: readonly RecognitionWarning[] }) {
  const blocking = warnings.filter((w) => w.severity === "blocking");
  if (blocking.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-xs text-neg">
      {blocking.map((w, i) => (
        <li key={i}>{w.message}</li>
      ))}
    </ul>
  );
}
