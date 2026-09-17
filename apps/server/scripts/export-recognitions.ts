/**
 * 导出识别记录并把用户改正后的牌写回检测框，供训练集回流。输出 NDJSON 到 stdout，
 * 分诊比例走 stderr（不污染数据流）。对齐逻辑在 `src/recognition/align.ts`，本文件只做装配。
 *
 * 判据：`corrected IS NOT NULL`。房间来的记录只有在结算命令被接受之后才回填 corrected
 * （房间里 `confirmRecognized` 只在 WinDialogs 的成功分支里调），而牌桌上其他三个人不会允许错误的
 * 牌局录进系统——「触发了结算」本身就是一次人力校验，不看用户改没改过。
 * `source=label`（已下线的标注页）是开发者显式提交的真值；`source=calc`（拍照算点数页）在玩家点
 * 「识别正确」时回填，没有牌桌把关，玩家可能对不影响点数的错牌照点不误。
 *
 * **在本机跑，不在容器里跑**：运行镜像只装了打包后的 server，没有脚本、没有源码、
 * 也没有 `@riichi/core`（align 对它是值导入）。先把库拷出来：
 *
 *   ssh bitego "docker exec riichi-scoreboard-riichi-1 node --input-type=module -e \
 *     \"const {DatabaseSync} = await import('node:sqlite'); const d = new DatabaseSync('/data/riichi.sqlite'); \
 *     d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); d.close()\" \
 *     && docker cp riichi-scoreboard-riichi-1:/data/riichi.sqlite /tmp/riichi.sqlite"
 *   scp bitego:/tmp/riichi.sqlite /tmp/
 *   yarn workspace @riichi/server exec tsx scripts/export-recognitions.ts /tmp/riichi.sqlite > records.ndjson
 *
 * 先 checkpoint 再拷是必要的：WAL 模式下最近的写还在 -wal 里，直接拷主库会丢掉刚打的那几局。
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
    // source 必须一直带着：房间结算、标注页、算点数页是可信度不同的群体
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
