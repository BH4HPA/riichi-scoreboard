#!/usr/bin/env bash
# 训练 YOLO11n。用法：scripts/train.sh [name] [extra yolo args...]（yolo 参数里的相对路径相对 ml/）
#   name 默认 tiles-$(date +%Y%m%d)；产物在 runs/<name>/weights/best.pt
#   微调已有权重：scripts/train.sh v1 model=runs/v0/weights/best.pt epochs=60
# fliplr=0：牌面左右不对称（数字/字牌镜像后不是同一类），关掉水平翻转增强。
# 默认 Apple Silicon（DEVICE=mps；个别算子回退 CPU 需要 PYTORCH_ENABLE_MPS_FALLBACK=1）；
# 有 CUDA 时 DEVICE=0。后面的 yolo 参数会覆盖前面的，所以 "$@" 里也可以直接写 device=0。
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

NAME="${1:-tiles-$(date +%Y%m%d)}"
shift || true

export PYTORCH_ENABLE_MPS_FALLBACK=1
uv run yolo detect train \
  model=yolo11n.pt \
  data=configs/tiles.yaml \
  imgsz=640 epochs=100 batch=32 device="${DEVICE:-mps}" \
  fliplr=0 \
  project=runs name="$NAME" exist_ok=True \
  "$@"

echo "best weights: runs/$NAME/weights/best.pt"
