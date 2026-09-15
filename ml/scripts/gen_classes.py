#!/usr/bin/env python3
"""从 packages/core/src/recognition/manifest.json 生成训练侧配置：
- configs/tiles.yaml        ultralytics 数据集描述（类 id 顺序 = manifest.classes）
- configs/label_studio.xml  Label Studio 标注模板（RectangleLabels，38 个标签）
CI 用 --check 校验两份生成物与 manifest 一致（core 不含 node 类型，不在单测里读文件）；改类目录必须重跑本脚本。"""

import json
import sys
from pathlib import Path

ML = Path(__file__).resolve().parent.parent
MANIFEST = ML.parent / "packages/core/src/recognition/manifest.json"


def render() -> dict[Path, str]:
    classes: list[str] = json.loads(MANIFEST.read_text(encoding="utf-8"))["classes"]
    names = "\n".join(f"  {i}: {name}" for i, name in enumerate(classes))
    labels = "\n".join(f'    <Label value="{name}"/>' for name in classes)
    return {
        ML / "configs/tiles.yaml": (
            "# 由 scripts/gen_classes.py 生成，勿手改；类 id 顺序 = packages/core/src/recognition/manifest.json\n"
            "path: ../data/merged\n"
            "train: images/train\n"
            "val: images/val\n"
            f"names:\n{names}\n"
        ),
        ML / "configs/label_studio.xml": (
            "<!-- 由 scripts/gen_classes.py 生成；Label Studio 项目 Labeling Interface 粘贴本文件 -->\n"
            "<View>\n"
            '  <Image name="image" value="$image" zoom="true"/>\n'
            '  <RectangleLabels name="label" toName="image">\n'
            f"{labels}\n"
            "  </RectangleLabels>\n"
            "</View>\n"
        ),
    }


def main(argv: list[str]) -> int:
    files = render()
    if argv == ["--check"]:
        stale = [p for p, text in files.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            print(f"out of date (run ml/scripts/gen_classes.py): {[str(p.relative_to(ML)) for p in stale]}")
            return 1
        print("ml/configs up to date")
        return 0
    if argv:
        print(__doc__, file=sys.stderr)
        return 1
    (ML / "configs").mkdir(exist_ok=True)
    for p, text in files.items():
        p.write_text(text, encoding="utf-8")
    print(f"-> {', '.join(str(p.relative_to(ML)) for p in files)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
