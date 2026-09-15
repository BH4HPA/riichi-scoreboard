#!/usr/bin/env python3
"""校验导出的 ONNX 与推理端约定一致，并打印 sha256（填 manifest 用）。
约定：单输入 images [1,3,640,640] float32 /255 RGB；单输出 [1,300,6]。
用法：uv run scripts/check_onnx.py <model.onnx> [image.jpg]   给图片时顺带跑一次并打印前几框。"""

import hashlib
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__, file=sys.stderr)
        return 1
    path = Path(argv[0])
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    (inp,) = sess.get_inputs()
    (out,) = sess.get_outputs()
    print(f"input  {inp.name} {inp.shape} {inp.type}")
    print(f"output {out.name} {out.shape} {out.type}")
    assert list(inp.shape) == [1, 3, 640, 640], f"unexpected input shape {inp.shape}"
    assert list(out.shape) == [1, 300, 6], f"unexpected output shape {out.shape} (export with nms=True batch=1)"

    if len(argv) > 1:
        from PIL import Image

        img = Image.open(argv[1]).convert("RGB")
        w, h = img.size
        scale = 640 / max(w, h)
        nw, nh = round(w * scale), round(h * scale)
        canvas = Image.new("RGB", (640, 640), (114, 114, 114))
        canvas.paste(img.resize((nw, nh), Image.BILINEAR), ((640 - nw) // 2, (640 - nh) // 2))
        x = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    else:
        x = np.zeros((1, 3, 640, 640), dtype=np.float32)

    t0 = time.perf_counter()
    (y,) = sess.run(None, {inp.name: x})
    ms = (time.perf_counter() - t0) * 1000
    rows = y[0][y[0][:, 4] > 0]
    print(f"run {ms:.0f} ms, {len(rows)} detections")
    for r in rows[:20]:
        print(f"  cls={int(r[5])} conf={r[4]:.2f} box=({r[0]:.0f},{r[1]:.0f},{r[2]:.0f},{r[3]:.0f})")

    print(f"sha256 {hashlib.sha256(path.read_bytes()).hexdigest()}  size {path.stat().st_size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
