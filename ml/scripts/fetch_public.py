#!/usr/bin/env python3
"""下载 Roboflow Universe 上的公开牌面数据集（YOLO 格式）到 data/raw/<name>/。
需要环境变量 ROBOFLOW_API_KEY（Universe 账号 Settings → API Key）。
每个数据集取最新版本；已存在的目录跳过（重下先删目录）。
用法：uv run scripts/fetch_public.py [name ...]   不传则全部。"""

import os
import sys
from pathlib import Path

DATASETS = {
    # name: (workspace, project)  —— name 也是 configs/remap/<name>.json 的文件名
    "riichimahjongdetection": ("riichimahjongdetection", "riichi-mahjong-detection"),
    "mahjong_yolo": ("test-wmo8i", "mahjong_yolo"),
    "yolo_mahjong": ("yolo-qshla", "yolo_mahjong"),
    "hust": ("hust-xq5rx", "riichi-mahjong"),
}

RAW = Path(__file__).resolve().parent.parent / "data/raw"


def main(argv: list[str]) -> int:
    key = os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        print("ROBOFLOW_API_KEY is required", file=sys.stderr)
        return 1
    names = argv or list(DATASETS)
    unknown = [n for n in names if n not in DATASETS]
    if unknown:
        print(f"unknown dataset(s): {unknown}; known: {list(DATASETS)}", file=sys.stderr)
        return 1

    from roboflow import Roboflow  # 延迟导入：只在真的下载时才拉起 SDK

    rf = Roboflow(api_key=key)
    for name in names:
        dest = RAW / name
        if dest.exists():
            print(f"skip {name}: {dest} exists")
            continue
        workspace, project_slug = DATASETS[name]
        project = rf.workspace(workspace).project(project_slug)
        versions = project.versions()
        if not versions:
            print(f"{name}: no versions published", file=sys.stderr)
            return 1
        latest = max(versions, key=lambda v: int(str(v.version).rsplit("/", 1)[-1]))
        print(f"{name}: downloading version {latest.version} -> {dest}")
        latest.download("yolov11", location=str(dest))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
