#!/usr/bin/env python3
"""用当前模型给自家照片预标注，输出 Label Studio 可导入的任务 JSON。
用法：uv run scripts/prelabel.py runs/<name>/weights/best.pt data/own [--out data/own_prelabel.json]

Label Studio 需以本地文件模式启动（见 README），图片 URL 形如 /data/local-files/?d=<相对 data/ 的路径>。
框以百分比写入 predictions，导入后逐张修正再导出 YOLO 到 data/raw/own/，交给 remap.py 并入训练集。"""

import argparse
import json
import sys
from pathlib import Path

ML = Path(__file__).resolve().parent.parent
DATA = ML / "data"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("weights")
    ap.add_argument("images", help="图片目录，须在 ml/data 之下")
    ap.add_argument("--out", default=None)
    ap.add_argument("--conf", type=float, default=0.25)
    args = ap.parse_args()

    images_dir = Path(args.images).resolve()
    try:
        rel_root = images_dir.relative_to(DATA)
    except ValueError:
        print(f"{images_dir} must live under {DATA}", file=sys.stderr)
        return 1
    files = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not files:
        print(f"no images in {images_dir}", file=sys.stderr)
        return 1

    from ultralytics import YOLO

    model = YOLO(args.weights)
    names = model.names
    tasks = []
    for res in model.predict([str(p) for p in files], imgsz=640, conf=args.conf, verbose=False, stream=True):
        h, w = res.orig_shape
        results = []
        for box, conf, cls in zip(res.boxes.xyxy.tolist(), res.boxes.conf.tolist(), res.boxes.cls.tolist()):
            x1, y1, x2, y2 = box
            results.append(
                {
                    "from_name": "label",
                    "to_name": "image",
                    "type": "rectanglelabels",
                    "original_width": w,
                    "original_height": h,
                    "image_rotation": 0,
                    "score": round(conf, 3),
                    "value": {
                        "x": 100 * x1 / w,
                        "y": 100 * y1 / h,
                        "width": 100 * (x2 - x1) / w,
                        "height": 100 * (y2 - y1) / h,
                        "rotation": 0,
                        "rectanglelabels": [names[int(cls)]],
                    },
                }
            )
        rel = (rel_root / Path(res.path).name).as_posix()
        tasks.append(
            {
                "data": {"image": f"/data/local-files/?d={rel}"},
                "predictions": [{"model_version": Path(args.weights).parent.parent.name, "result": results}],
            }
        )

    out = Path(args.out) if args.out else DATA / f"{rel_root.name}_prelabel.json"
    out.write_text(json.dumps(tasks, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(tasks)} tasks -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
