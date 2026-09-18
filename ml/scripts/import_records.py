#!/usr/bin/env python3
"""把线上识别记录导回训练集。

输入是 apps/server/scripts/export-recognitions.ts 的 NDJSON —— 位置对齐在那边做（layoutHand 是
TypeScript，Python 复刻它等于养第二份布局规则），这里只负责拉照片、归一化坐标、写文件。

    docker exec riichi-scoreboard-riichi-1 node --experimental-strip-types \\
      /app/scripts/export-recognitions.ts /data/riichi.sqlite > records.ndjson
    uv run scripts/import_records.py records.ndjson

产出：
  data/raw/records/{images,labels}/   status=auto 的样本，YOLO 格式，可直接进 remap.py
  data/raw/records/pending/           status=manual 的样本 + 预标注的 Label Studio 任务
照片从 COS 拉（需要 QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY 与 coscmd）；本地存储模式
用 --photos <目录> 直接指到 DATA_DIR/objects。
用法：uv run scripts/import_records.py <records.ndjson> [--photos 目录] [--source room|label|calc]
"""

import argparse
import json
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

ML = Path(__file__).resolve().parent.parent
OUT = ML / "data/raw/records"
COS_PREFIX = "riichi/"


def fetch_photo(key: str, dest: Path, photos: Path | None) -> bool:
    """拿到这条记录的照片。本地模式直接复制，否则从 COS 下载。"""
    if photos is not None:
        src = photos / key
        if not src.exists():
            return False
        shutil.copyfile(src, dest)
        return True
    r = subprocess.run(
        ["coscmd", "download", COS_PREFIX + key, str(dest)],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print(f"  下载失败 {key}: {r.stderr.strip().splitlines()[-1:]}", file=sys.stderr)
    return r.returncode == 0


def to_yolo(labels: list[dict], width: int, height: int) -> list[str] | None:
    """像素框 → YOLO 归一化行。框超出画面说明照片与检测框不是同一张，整条作废。"""
    lines = []
    for lab in labels:
        x1, y1, x2, y2 = lab["box"]
        if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
            return None
        cx, cy = (x1 + x2) / 2 / width, (y1 + y2) / 2 / height
        w, h = (x2 - x1) / width, (y2 - y1) / height
        lines.append(f"{lab['cls']} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
    return lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("records", type=Path, help="export-recognitions.ts 的 NDJSON")
    ap.add_argument("--photos", type=Path, help="本地照片根目录（DATA_DIR/objects），不给则走 COS")
    ap.add_argument("--source", choices=["room", "label", "calc"], help="只导入某一种来源")
    args = ap.parse_args()

    images = OUT / "images"
    labels_dir = OUT / "labels"
    pending = OUT / "pending"
    for d in (images, labels_dir, pending):
        d.mkdir(parents=True, exist_ok=True)

    stats: Counter[str] = Counter()
    tasks: list[dict] = []
    for line in args.records.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        if args.source and rec["source"] != args.source:
            continue
        stats[rec["source"]] += 1
        manual = rec["status"] == "manual"
        dest_dir = pending if manual else images
        photo = dest_dir / f"{rec['id']}.jpg"
        if not fetch_photo(rec["photoKey"], photo, args.photos):
            stats["照片缺失"] += 1
            photo.unlink(missing_ok=True)
            continue

        with Image.open(photo) as im:
            width, height = im.size
        lines = to_yolo(rec["labels"], width, height)
        if lines is None:
            stats["框与照片对不上"] += 1
            photo.unlink(missing_ok=True)
            continue

        if manual:
            # 人工队列：照片 + 预标注，喂 prelabel.py 生成的同一种 Label Studio 任务结构
            tasks.append({"id": rec["id"], "image": photo.name, "reason": rec["reason"], "labels": lines})
            stats["待人工"] += 1
        else:
            (labels_dir / f"{rec['id']}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
            stats["自动"] += 1

    if tasks:
        (pending / "tasks.json").write_text(
            json.dumps(tasks, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    auto, manual_n = stats["自动"], stats["待人工"]
    total = auto + manual_n
    print(f"来源：room {stats['room']} / calc {stats.get('calc', 0)} / label {stats['label']}")
    print(f"自动入库 {auto}，待人工 {manual_n}" + (f"（{manual_n / total:.0%} 是难例）" if total else ""))
    for k in ("照片缺失", "框与照片对不上"):
        if stats[k]:
            print(f"跳过 {k} {stats[k]} 条")
    # 自动那条都是模型已经做对的样本，只喂它会把训练集越练越窄（自训练陷阱）。
    # 真正涨点的是下面这些难例，优先处理。
    if manual_n:
        print(f"人工队列在 {pending.relative_to(ML)}，先补这批再训练")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
