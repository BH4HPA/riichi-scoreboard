#!/usr/bin/env bash
# 导出 ONNX（端到端：NMS 已嵌入图内，输出固定 [1, 300, 6] = x1 y1 x2 y2 conf cls，letterbox 输入坐标）。
# 用法：scripts/export.sh runs/<name>/weights/best.pt [extra yolo args...]
# batch=1 dynamic=False 是推理端的契约（手机与服务端都按固定形状 [1,3,640,640] → [1,300,6] 读）。
# conf/iou 在导出时固化，推理端不再做阈值；改阈值 = 重新导出。
# agnostic_nms=True：牌与牌不重叠，同一张牌被框成两个类时只留高置信的那个（v0 在自家牌上实测出现过）。
set -euo pipefail

PT="${1:?usage: $0 <best.pt> [yolo args...]}"
shift
PT="$(cd "$(dirname "$PT")" && pwd)/$(basename "$PT")"
cd "$(dirname "${BASH_SOURCE[0]}")/.."

uv run yolo export \
  model="$PT" format=onnx \
  nms=True agnostic_nms=True batch=1 imgsz=640 dynamic=False opset=17 simplify=True \
  conf=0.25 iou=0.5 \
  "$@"

uv run scripts/check_onnx.py "${PT%.pt}.onnx"
