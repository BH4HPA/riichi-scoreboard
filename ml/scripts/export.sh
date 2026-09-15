#!/usr/bin/env bash
# 导出 ONNX（端到端：NMS 已嵌入图内，输出固定 [1, 300, 6] = x1 y1 x2 y2 conf cls，letterbox 输入坐标）。
# 用法：scripts/export.sh runs/<name>/weights/best.pt [extra yolo args...]
# batch=1 dynamic=False 是硬约束：ultralytics 的 nms=True 导出在 batch>1 时只有第 0 张有结果。
# conf/iou 在导出时固化，推理端不再做阈值；改阈值 = 重新导出。
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PT="${1:?usage: $0 <best.pt> [yolo args...]}"
shift

uv run yolo export \
  model="$PT" format=onnx \
  nms=True batch=1 imgsz=640 dynamic=False opset=17 simplify=True \
  conf=0.25 iou=0.5 \
  "$@"

ONNX="${PT%.pt}.onnx"
uv run scripts/check_onnx.py "$ONNX"
