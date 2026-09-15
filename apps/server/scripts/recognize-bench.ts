/**
 * 布局规则评估：读 ml/data/bench/truth.txt 的真值与 ml/scripts/bench_dets.py 产出的检测框，跑 core 的 layoutHand，
 * 算整手牌完全正确率（暗牌 + 和张 + 副露 + 指示牌全对）与牌面多重集正确率（只看认出的牌，不看布局）。
 * 用法：yarn workspace @riichi/server exec tsx scripts/recognize-bench.ts <truth.txt> <dets.json> [--dump IMG_xxxx]
 *   --dump 只打印一张图的检测框（按 cy 排序）与布局结果，用来看某张为什么错。
 */
import fs from "node:fs";
import { layoutHand, RECOGNITION_CLASSES, type Detection, type Tile } from "@riichi/core";

const args = process.argv.slice(2);
const dumpAt = args.indexOf("--dump");
const dump = dumpAt >= 0 ? args[dumpAt + 1] : null;
if (dumpAt >= 0) args.splice(dumpAt, 2);
const [truthPath, detsPath] = args as [string | undefined, string | undefined];
if (!truthPath || !detsPath) {
  console.error("usage: recognize-bench.ts <truth.txt> <dets.json> [--dump IMG_xxxx]");
  process.exit(1);
}

type Dets = Record<string, { ms: number; detections: Detection[] }>;
const dets = JSON.parse(fs.readFileSync(detsPath, "utf8")) as Dets;

if (dump) {
  const d = dets[dump];
  if (!d) {
    console.error(`${dump} not in ${detsPath}`);
    process.exit(1);
  }
  const items = d.detections
    .map((x) => ({
      n: RECOGNITION_CLASSES[x.cls]!,
      cx: (x.box[0] + x.box[2]) / 2,
      cy: (x.box[1] + x.box[3]) / 2,
      w: x.box[2] - x.box[0],
      h: x.box[3] - x.box[1],
      c: x.conf,
    }))
    .sort((a, b) => a.cy - b.cy);
  for (const i of items) {
    const f = (v: number, p: number) => v.toFixed(0).padStart(p);
    console.log(
      `${i.n.padEnd(5)} cx=${f(i.cx, 5)} cy=${f(i.cy, 5)} w=${f(i.w, 4)} h=${f(i.h, 4)} ratio=${(i.w / i.h).toFixed(2)} conf=${i.c.toFixed(2)}`,
    );
  }
  const r = layoutHand(d.detections);
  console.log("RESULT", JSON.stringify(r.hand));
  console.log("WARN", r.warnings.map((w) => `${w.code}:${w.message}`).join(" | "));
  process.exit(0);
}

/** MPSZ → 牌码（0 = 赤五） */
function tiles(s: string): Tile[] {
  const out: Tile[] = [];
  for (const m of s.matchAll(/([0-9]+)([mpsz])/g)) {
    for (const d of m[1]!) {
      const n = Number(d);
      const suit = m[2]!;
      if (n === 0) out.push(suit === "m" ? 35 : suit === "p" ? 36 : 37);
      else out.push(suit === "m" ? n : suit === "p" ? 9 + n : suit === "s" ? 18 + n : 27 + n);
    }
  }
  return out;
}

interface Truth {
  closed: Tile[]; // 含和张
  win: Tile;
  melds: { open: boolean; tiles: Tile[] }[];
  dora: Tile[];
  ura: Tile[];
  /** 认不出的 token 是备注：这张图是负例（不成和牌型等），不计入正确率 */
  note: string[];
}

/** 一行一张：`IMG_xxxx: 暗牌(不含和张) 和X [碰XXX|吃XYZ|明杠XXXX|暗杠XXXX ...] 表<指示牌> [里<指示牌>]` */
function parseTruth(): Map<string, Truth> {
  const map = new Map<string, Truth>();
  for (const raw of fs.readFileSync(truthPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [name, rest] = line.split(":", 2) as [string, string];
    if (!rest.trim()) continue; // 还没填真值
    const parts = rest.trim().split(/\s+/);
    const t: Truth = { closed: tiles(parts[0]!), win: 0, melds: [], dora: [], ura: [], note: [] };
    for (const p of parts.slice(1)) {
      if (p.startsWith("和")) t.win = tiles(p.slice(1))[0]!;
      else if (p.startsWith("明杠")) t.melds.push({ open: true, tiles: tiles(p.slice(2)) });
      else if (p.startsWith("暗杠")) t.melds.push({ open: false, tiles: tiles(p.slice(2)) });
      else if (p.startsWith("碰") || p.startsWith("吃"))
        t.melds.push({ open: true, tiles: tiles(p.slice(1)) });
      else if (p.startsWith("表")) t.dora = tiles(p.slice(1));
      else if (p.startsWith("里")) t.ura = tiles(p.slice(1));
      else t.note.push(p);
    }
    if (t.win) t.closed.push(t.win);
    map.set(name, t);
  }
  return map;
}

const sorted = (a: Tile[]) => [...a].sort((x, y) => x - y).join(",");
const meldKey = (m: { open: boolean; tiles: Tile[] }) => `${m.open ? "o" : "c"}:${sorted(m.tiles)}`;
const meldsKey = (ms: { open: boolean; tiles: Tile[] }[]) => ms.map(meldKey).sort().join(" ");
const faces = (h: { closed: Tile[]; melds: { tiles: Tile[] }[] }) =>
  sorted([...h.closed, ...h.melds.flatMap((m) => m.tiles)]);

const truth = parseTruth();
let exact = 0;
let tilesOk = 0;
let n = 0;
for (const [name, t] of truth) {
  const d = dets[name];
  if (!d) continue;
  n++;
  const { hand, warnings } = layoutHand(d.detections);
  const closedOk = sorted(hand.closed) === sorted(t.closed);
  const winOk = hand.winTile === t.win;
  const meldsOk = meldsKey(hand.melds) === meldsKey(t.melds);
  const doraOk =
    sorted(hand.doraIndicators) === sorted(t.dora) && sorted(hand.uraIndicators) === sorted(t.ura);
  const all = closedOk && winOk && meldsOk && doraOk;
  const facesOk = faces(hand) === faces(t);
  if (t.note.length === 0) {
    exact += all ? 1 : 0;
    tilesOk += facesOk ? 1 : 0;
  }
  const mark = (ok: boolean) => (ok ? "✓" : "✗");
  console.log(
    `${name} ${t.note.length ? "(负例)" : all ? "OK " : "BAD"} closed=${mark(closedOk)} win=${mark(winOk)} melds=${mark(meldsOk)} dora=${mark(doraOk)} faces=${mark(facesOk)} ${d.detections.length}框 ${d.ms}ms ${warnings.map((w) => w.code).join(",")}`,
  );
}
const positives = [...truth.values()].filter((t) => t.note.length === 0).length;
console.log(
  `\n整手牌完全正确 ${exact}/${positives}  牌面多重集正确 ${tilesOk}/${positives}  (共 ${n} 张)`,
);
