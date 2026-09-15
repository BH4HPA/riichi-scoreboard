#!/usr/bin/env python3
"""把 data/raw/<name>/ 下各来源的 YOLO 数据集重映射到 canonical 38 类，合并成 data/merged/。

来源目录支持两种类目录格式：
- Roboflow 导出：data.yaml 里的 names（list 或 {id: name}），图片在 */images/，标签在同级 labels/
- Label Studio 的 YOLO 导出：classes.txt（每行一个类），images/ + labels/

映射文件 configs/remap/<name>.json：{"来源类名": "canonical 类名" | null}，null = 丢弃该类的框。
首次遇到没有映射文件的来源，会按别名表猜一份写到 configs/remap/<name>.json，
未能猜出的项填 null 并退出（返回码 2），请人工补全后重跑。

划分规则：来源自带 train/valid(val)/test 目录的（Roboflow 导出，train 里常有同一原图的增强副本）沿用其划分，
valid 与 test 都进 val，避免副本跨 train/val 泄漏抬高 mAP；没有划分的来源（Label Studio 导出）按固定种子抽
10% 作 val。文件名加 <name>__ 前缀避免撞名。每次运行先清空 data/merged。
用法：uv run scripts/remap.py [--val-ratio 0.1] [--seed 42]"""

import argparse
import json
import random
import re
import shutil
import sys
from pathlib import Path

import yaml

ML = Path(__file__).resolve().parent.parent
RAW = ML / "data/raw"
MERGED = ML / "data/merged"
REMAP_DIR = ML / "configs/remap"
MANIFEST = ML.parent / "packages/core/src/recognition/manifest.json"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

# 常见别名 → canonical；键全部小写、去掉 - _ 空格后比较
ALIASES = {
    "east": "1z", "ton": "1z", "e": "1z",
    "south": "2z", "nan": "2z", "s": "2z",
    "west": "3z", "sha": "3z", "shaa": "3z", "w": "3z",
    "north": "4z", "pei": "4z", "n": "4z",
    "haku": "5z", "white": "5z", "whitedragon": "5z", "bai": "5z",
    "hatsu": "6z", "green": "6z", "greendragon": "6z", "fa": "6z",
    "chun": "7z", "red": "7z", "reddragon": "7z", "zhong": "7z",
    "back": "back", "tileback": "back", "backside": "back", "hidden": "back",
}


def guess(source: str) -> str | None:
    key = re.sub(r"[-_\s]", "", source.lower())
    if re.fullmatch(r"[0-9][mps]|[1-7]z", key):
        return key
    m = re.fullmatch(r"([mps])([0-9])", key)  # m1 / p5
    if m:
        return f"{m.group(2)}{m.group(1)}"
    suits = {"man": "m", "wan": "m", "pin": "p", "sou": "s", "so": "s"}
    m = re.fullmatch(r"([1-9])(man|wan|pin|sou|so)", key) or re.fullmatch(r"(?:(man|wan|pin|sou|so))([1-9])", key)
    if m:  # 1man / 5pin / 3sou / sou7 / man5
        n, s = (m.group(1), m.group(2)) if m.group(1).isdigit() else (m.group(2), m.group(1))
        return f"{n}{suits[s]}"
    m = re.fullmatch(r"(aka|red|r)?5([mps])(r|red|aka)?", key)  # 5mr / aka5p / red5s / r5m
    if m and (m.group(1) or m.group(3)):
        return f"0{m.group(2)}"
    return ALIASES.get(key)


def source_classes(src: Path) -> list[str]:
    data_yaml = src / "data.yaml"
    if data_yaml.exists():
        names = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))["names"]
        if isinstance(names, dict):
            return [str(names[k]) for k in sorted(names, key=int)]
        return [str(n) for n in names]
    classes_txt = src / "classes.txt"
    if classes_txt.exists():
        return [line.strip() for line in classes_txt.read_text(encoding="utf-8").splitlines() if line.strip()]
    raise SystemExit(f"{src}: neither data.yaml nor classes.txt")


def load_remap(name: str, classes: list[str], canonical: list[str]) -> dict[str, str | None] | None:
    """已有映射文件则校验并返回；没有则起草一份并返回 None（调用方汇总后统一退出）。"""
    path = REMAP_DIR / f"{name}.json"
    if path.exists():
        remap = json.loads(path.read_text(encoding="utf-8"))
        missing = [c for c in classes if c not in remap]
        bad = {c: v for c, v in remap.items() if v is not None and v not in canonical}
        if missing or bad:
            raise SystemExit(f"{path}: missing {missing}, invalid targets {bad}")
        return remap
    remap = {c: guess(c) for c in classes}
    REMAP_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(remap, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    unresolved = [c for c, v in remap.items() if v is None]
    print(f"drafted {path.relative_to(ML)} ({len(classes)} classes, unresolved: {unresolved})")
    return None


SPLIT_DIRS = {"train": "train", "valid": "val", "val": "val", "test": "val"}


def collect(src: Path) -> list[tuple[Path, Path, str | None]]:
    """(图片, 标签, 来源自带的划分 train/val 或 None)。"""
    pairs = []
    for img in src.rglob("*"):
        if img.suffix.lower() not in IMAGE_SUFFIXES or img.parent.name != "images":
            continue
        label = img.parent.parent / "labels" / f"{img.stem}.txt"
        if not label.exists():
            continue
        split = next((SPLIT_DIRS[p.name] for p in img.parents if p.name in SPLIT_DIRS), None)
        pairs.append((img, label, split))
    return pairs


def convert_label(text: str, id_map: dict[int, int | None], where: Path) -> str:
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        parts = line.split()
        if not parts:
            continue
        if len(parts) != 5:
            raise SystemExit(f"{where}:{n}: expected `cls cx cy w h`, got {len(parts)} columns (segmentation labels?)")
        target = id_map.get(int(parts[0]))
        if target is None:
            continue
        out.append(" ".join([str(target), *parts[1:]]))
    return "\n".join(out) + ("\n" if out else "")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--val-ratio", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    canonical: list[str] = json.loads(MANIFEST.read_text(encoding="utf-8"))["classes"]
    sources = sorted(p for p in RAW.iterdir() if p.is_dir()) if RAW.exists() else []
    if not sources:
        print(f"no sources under {RAW}", file=sys.stderr)
        return 1

    plan: dict[str, tuple[dict[int, int | None], list[tuple[Path, Path, str | None]]]] = {}
    drafted = False
    for src in sources:
        classes = source_classes(src)
        remap = load_remap(src.name, classes, canonical)
        if remap is None:
            drafted = True
            continue
        id_map = {i: (canonical.index(remap[c]) if remap[c] is not None else None) for i, c in enumerate(classes)}
        pairs = collect(src)
        if not pairs:
            print(f"{src.name}: no image/label pairs", file=sys.stderr)
            return 1
        plan[src.name] = (id_map, pairs)
    if drafted:
        print("fill the null entries in configs/remap/*.json (keep null to drop that class) and rerun", file=sys.stderr)
        return 2

    if MERGED.exists():
        shutil.rmtree(MERGED)
    for split in ("train", "val"):
        (MERGED / "images" / split).mkdir(parents=True)
        (MERGED / "labels" / split).mkdir(parents=True)

    rng = random.Random(args.seed)
    counts = {c: 0 for c in canonical}
    for name, (id_map, pairs) in plan.items():
        pairs = sorted(pairs)
        own_split = all(split is not None for _, _, split in pairs)
        if not own_split:
            rng.shuffle(pairs)
        n_val = 0 if own_split else (max(1, round(len(pairs) * args.val_ratio)) if len(pairs) >= 2 else 0)
        for i, (img, label, split) in enumerate(pairs):
            split = split if own_split else ("val" if i < n_val else "train")
            n_val += split == "val" and own_split
            stem = f"{name}__{img.stem}"
            shutil.copy2(img, MERGED / "images" / split / f"{stem}{img.suffix.lower()}")
            converted = convert_label(label.read_text(encoding="utf-8"), id_map, label)
            (MERGED / "labels" / split / f"{stem}.txt").write_text(converted, encoding="utf-8")
            for line in converted.splitlines():
                counts[canonical[int(line.split()[0])]] += 1
        print(f"{name}: {len(pairs)} images, {n_val} val ({'own split' if own_split else 'random split'})")

    empty = [c for c, n in counts.items() if n == 0]
    print("boxes per class:", json.dumps(counts, ensure_ascii=False))
    if empty:
        print(f"WARNING classes with no boxes: {empty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
