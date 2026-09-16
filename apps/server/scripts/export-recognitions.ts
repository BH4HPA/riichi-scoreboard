/**
 * 导出识别记录并把用户改正后的牌写回检测框，供训练集回流。输出 NDJSON 到 stdout，
 * 分诊比例走 stderr（不污染数据流）。对齐逻辑在 `src/recognition/align.ts`，本文件只做装配。
 *
 * 判据：`corrected IS NOT NULL`。房间来的记录只有在结算命令被接受之后才回填 corrected
 * （`confirmRecognized` 只在 WinDialogs 的成功分支里调），而牌桌上其他三个人不会允许错误的
 * 牌局录进系统——「触发了结算」本身就是一次人力校验，不看用户改没改过。
 * 标注模式（`source=label`）的 corrected 是用户显式提交的真值。
 *
 * 用法（线上）：
 *   docker exec riichi-scoreboard-riichi-1 node --experimental-strip-types \
 *     /app/scripts/export-recognitions.ts /data/riichi.sqlite > records.ndjson
 * 本机：yarn workspace @riichi/server exec tsx scripts/export-recognitions.ts <db 路径>
 */
import { DatabaseSync } from "node:sqlite";
import type { Detection, HandInput, RecognizedHand } from "@riichi/core";
import { align } from "../src/recognition/align";

const dbFile = process.argv[2];
if (!dbFile) {
  console.error("usage: export-recognitions.ts <sqlite 文件>");
  process.exit(1);
}

interface Row {
  id: string;
  photo_key: string;
  model_id: string;
  source: string;
  detections: string | null;
  recognized: string | null;
  corrected: string | null;
  created_at: number;
}

const db = new DatabaseSync(dbFile, { readOnly: true });
const rows = db
  .prepare(
    // source 必须一直带着：标注模式与房间结算是两个可信度不同的群体
    "SELECT id, photo_key, model_id, source, detections, recognized, corrected, created_at" +
      " FROM recognitions WHERE corrected IS NOT NULL AND detections IS NOT NULL ORDER BY created_at",
  )
  .all() as unknown as Row[];

let auto = 0;
for (const r of rows) {
  const detections = JSON.parse(r.detections!) as Detection[];
  const recognized = JSON.parse(r.recognized ?? "null") as RecognizedHand | null;
  const corrected = JSON.parse(r.corrected!) as HandInput;
  const aligned = recognized
    ? align(detections, recognized, corrected)
    : {
        labels: detections.map((d) => ({ cls: d.cls, box: d.box })),
        status: "manual" as const,
        reason: "没有回填识别结果",
      };
  if (aligned.status === "auto") auto++;
  process.stdout.write(
    `${JSON.stringify({
      id: r.id,
      photoKey: r.photo_key,
      modelId: r.model_id,
      source: r.source,
      createdAt: r.created_at,
      ...aligned,
    })}\n`,
  );
}
db.close();
// 自动那条会把训练集偏向模型已经做对的样本（自训练陷阱），真正有价值的恰恰是漏检误检的难例，
// 所以两边的数量要一眼看得到。
console.error(`共 ${rows.length} 条：自动 ${auto}，待人工 ${rows.length - auto}`);
