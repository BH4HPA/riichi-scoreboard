#!/usr/bin/env python3
"""校验导出的 ONNX 与推理端约定一致，并打印 sha256（填 manifest 用）。
约定：单输入 images [1,3,<imgsz>,<imgsz>] float32 /255 RGB；单输出 [1,300,6]；
ONNX 元数据里的 names（ultralytics 导出时写入）必须与 core manifest 的 classes 逐位相同——
形状一样但类顺序错位不会报错、只会静默识别成错牌，这是唯一能机器验证类契约的地方。
用法：uv run scripts/check_onnx.py <model.onnx> [image.jpg]   给图片时顺带跑一次并打印前几框。"""

import ast
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

MANIFEST = Path(__file__).resolve().parent.parent.parent / "packages/core/src/recognition/manifest.json"


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__, file=sys.stderr)
        return 1
    path = Path(argv[0])
    classes: list[str] = json.loads(MANIFEST.read_text(encoding="utf-8"))["classes"]

    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    (inp,) = sess.get_inputs()
    (out,) = sess.get_outputs()
    meta = sess.get_modelmeta().custom_metadata_map
    print(f"input  {inp.name} {inp.shape} {inp.type}")
    print(f"output {out.name} {out.shape} {out.type}")

    imgsz = inp.shape[2]
    assert list(inp.shape) == [1, 3, imgsz, imgsz], f"unexpected input shape {inp.shape}"
    assert list(out.shape) == [1, 300, 6], f"unexpected output shape {out.shape} (export with nms=True batch=1)"
    assert "names" in meta, "no `names` metadata: not an ultralytics export?"
    names = ast.literal_eval(meta["names"])
    exported = [names[i] for i in range(len(names))]
    assert exported == classes, f"class order differs from core manifest:\n  onnx     {exported}\n  manifest {classes}"
    print(f"classes ok ({len(classes)}), imgsz {imgsz}")

    if len(argv) > 1:
        from PIL import Image

        img = Image.open(argv[1]).convert("RGB")
        w, h = img.size
        scale = imgsz / max(w, h)
        nw, nh = round(w * scale), round(h * scale)
        canvas = Image.new("RGB", (imgsz, imgsz), (114, 114, 114))
        canvas.paste(img.resize((nw, nh), Image.BILINEAR), ((imgsz - nw) // 2, (imgsz - nh) // 2))
        x = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    else:
        x = np.zeros((1, 3, imgsz, imgsz), dtype=np.float32)

    t0 = time.perf_counter()
    (y,) = sess.run(None, {inp.name: x})
    ms = (time.perf_counter() - t0) * 1000
    rows = y[0][y[0][:, 4] > 0]
    print(f"run {ms:.0f} ms, {len(rows)} detections")
    for r in rows[:20]:
        print(f"  {classes[int(r[5])]} conf={r[4]:.2f} box=({r[0]:.0f},{r[1]:.0f},{r[2]:.0f},{r[3]:.0f})")

    print(f"sha256 {hashlib.sha256(path.read_bytes()).hexdigest()}  size {path.stat().st_size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
