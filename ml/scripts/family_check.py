#!/usr/bin/env python3
"""全家福检查：一张照片里 38 类各恰好一枚，对每张图跑模型，报告漏检 / 重复的类，并存带框图。
换一副牌、换光线时用它快速看模型迁移得怎么样，比 mAP 直观。
用法：uv run scripts/family_check.py <weights> <img...>   带框图存到图片旁的 <name>_pred.jpg"""

import collections
import json
import pathlib
import sys

from PIL import Image, ImageDraw
from ultralytics import YOLO

ML = pathlib.Path(__file__).resolve().parent.parent
CLASSES: list[str] = json.loads((ML.parent / "packages/core/src/recognition/manifest.json").read_text(encoding="utf-8"))["classes"]


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    model = YOLO(argv[0])
    for img in argv[1:]:
        res = model.predict(img, imgsz=640, conf=0.25, verbose=False)[0]
        names = [res.names[int(c)] for c in res.boxes.cls.tolist()]
        got = collections.Counter(names)
        missing = [c for c in CLASSES if got[c] == 0]
        dup = {c: n for c, n in got.items() if n > 1}
        print(f"{pathlib.Path(img).name}: {len(names)} boxes, missing {len(missing)}: {missing}, duplicated: {dup}")
        im = Image.open(img).convert("RGB")
        d = ImageDraw.Draw(im)
        for (x1, y1, x2, y2), c, p in zip(res.boxes.xyxy.tolist(), names, res.boxes.conf.tolist()):
            d.rectangle((x1, y1, x2, y2), outline="red", width=max(2, im.width // 800))
            d.text((x1 + 8, y1 + 8), f"{c} {p:.2f}", fill="yellow")
        im.thumbnail((1600, 1600))
        im.save(pathlib.Path(img).with_name(pathlib.Path(img).stem + "_pred.jpg"), quality=85)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
