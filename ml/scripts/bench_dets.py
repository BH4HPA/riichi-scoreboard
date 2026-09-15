#!/usr/bin/env python3
"""用导出的 ONNX 在评估集 data/bench/*.jpg 上出检测框（原图像素坐标），与手机端同一套 letterbox（640、灰 114）
与解码（conf 为 0 即止）。结果给应用侧的 `yarn workspace @riichi/server exec tsx scripts/recognize-bench.ts` 跑
布局规则、对照 data/bench/truth.txt 算整手牌完全正确率——模型（这里）与布局（那里）两段分开评估。
用法：uv run scripts/bench_dets.py runs/v1/weights/best.onnx data/bench/dets-v1.json"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

ML = Path(__file__).resolve().parent.parent
SIZE = 640


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 1
    sess = ort.InferenceSession(sys.argv[1], providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    out: dict[str, dict] = {}
    for img in sorted((ML / "data/bench").glob("*.jpg")):
        im = ImageOps.exif_transpose(Image.open(img)).convert("RGB")
        w, h = im.size
        s = SIZE / max(w, h)
        nw, nh = round(w * s), round(h * s)
        px, py = (SIZE - nw) // 2, (SIZE - nh) // 2
        canvas = Image.new("RGB", (SIZE, SIZE), (114, 114, 114))
        canvas.paste(im.resize((nw, nh), Image.BILINEAR), (px, py))
        x = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        t0 = time.perf_counter()
        (y,) = sess.run(None, {inp: x})
        ms = (time.perf_counter() - t0) * 1000
        dets = []
        for r in y[0]:
            if r[4] <= 0:
                break
            x1, y1, x2, y2 = (r[0] - px) / s, (r[1] - py) / s, (r[2] - px) / s, (r[3] - py) / s
            box = [float(max(0, x1)), float(max(0, y1)), float(min(w, x2)), float(min(h, y2))]
            dets.append({"cls": int(round(float(r[5]))), "conf": float(r[4]), "box": box})
        out[img.stem] = {"ms": round(ms), "detections": dets}
    Path(sys.argv[2]).write_text(json.dumps(out), encoding="utf-8")
    print(f"{len(out)} images -> {sys.argv[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
