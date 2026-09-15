#!/usr/bin/env python3
"""用 data/sprites 里的牌面贴图合成训练集（剪贴合成，标签自动生成）。

场景按拍照约定生成：手牌行 = 暗牌连排 + 横放和张 → 留空 → 副露组（3/4 张，暗杠 = 牌背 X X 牌背；
副露也可能放在手牌下方一行）；
手牌上方 0–2 行指示牌（上表下里，可含牌背）；再往上随机铺 6×n 牌河（可含一张横放的立直牌）、
散落杂牌、被画面切掉的邻家牌河。整体加透视/旋转，逐牌加阴影与亮度抖动，全图加色温/模糊/噪声/JPEG。
背景用 data/backgrounds/*.jpg（不含任何牌的空桌面照片）；没有时退回随机纯色 + 噪声底图。

输出 YOLO 目录 <out>/train/{images,labels} + <out>/data.yaml（类名 = manifest 顺序），
放在 data/raw/ 下即可被 remap.py 当作一个只有 train 划分的来源并入 merged（不会进 val）。
用法：uv run scripts/synth.py [--n 5000] [--out data/raw/synth] [--seed 0] [--workers 8]"""

import argparse
import io
import json
import math
import random
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ML = Path(__file__).resolve().parent.parent
MANIFEST = ML.parent / "packages/core/src/recognition/manifest.json"
CLASSES: list[str] = json.loads(MANIFEST.read_text(encoding="utf-8"))["classes"]
FACES = [c for c in CLASSES if c != "back"]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

SPRITES: dict[str, list[Image.Image]] = {}
BACKGROUNDS: list[Path] = []


def load_assets(sprites_dir: Path, backgrounds_dir: Path) -> None:
    for cls in CLASSES:
        files = sorted((sprites_dir / cls).glob("*.png")) if (sprites_dir / cls).is_dir() else []
        SPRITES[cls] = [Image.open(f).convert("RGB") for f in files]
    missing = [c for c in CLASSES if not SPRITES[c]]
    if missing:
        raise SystemExit(f"no sprites for {missing}: run sprites.py first")
    if backgrounds_dir.is_dir():
        BACKGROUNDS.extend(sorted(p for p in backgrounds_dir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES))


# ---------- 布局：单位为「牌宽」，先在抽象坐标里摆，最后统一缩放 ----------


class Tile:
    __slots__ = ("cls", "x", "y", "side", "rot")

    def __init__(self, cls: str, x: float, y: float, side: bool = False, rot: float = 0.0):
        self.cls, self.x, self.y, self.side, self.rot = cls, x, y, side, rot  # x,y = 中心；side = 横放；rot = 额外旋转（度）


def jitter(rng: random.Random, amount: float) -> float:
    return rng.uniform(-amount, amount)


def hand_row(rng: random.Random, aspect: float) -> list[Tile]:
    """一行手牌，返回 y=0 基线上的牌。宽度单位 = 牌宽，横放牌占 aspect 个单位宽。"""
    n_melds = rng.choices([0, 1, 2, 3, 4], weights=[35, 30, 20, 10, 5])[0]
    n_closed = 13 - 3 * n_melds
    tiles: list[Tile] = []
    x = 0.0
    for _ in range(n_closed):
        tiles.append(Tile(rng.choice(FACES), x + 0.5 + jitter(rng, 0.02), jitter(rng, 0.03), rot=jitter(rng, 3)))
        x += 1.0 + rng.uniform(0, 0.06)
    if rng.random() < 0.9:  # 和张横放接在末尾
        tiles.append(Tile(rng.choice(FACES), x + aspect / 2 + jitter(rng, 0.03), jitter(rng, 0.05), side=True, rot=jitter(rng, 3)))
        x += aspect + rng.uniform(0, 0.08)
    else:
        tiles.append(Tile(rng.choice(FACES), x + 0.5, jitter(rng, 0.03), rot=jitter(rng, 3)))
        x += 1.0
    # 副露：放手牌行右侧（组间留空）、下方一行或上方一行都行（靠横置牌与指示牌区分）
    where = rng.choices(["right", "below", "above"], weights=[40, 35, 25])[0] if n_melds else "right"
    y_meld = {"right": 0.0, "below": (1.1 + rng.uniform(0, 0.5)) * aspect, "above": -(1.1 + rng.uniform(0, 0.5)) * aspect}[where]
    if where != "right":
        x = rng.uniform(0, 4)
    for _ in range(n_melds):
        x += rng.uniform(0.6, 1.6)  # 组间留空
        size = 3 if rng.random() < 0.6 else 4
        if size == 4 and rng.random() < 0.5:  # 暗杠：牌背 X X 牌背
            t = rng.choice(FACES)
            group = ["back", t, t, "back"]
        else:
            t = rng.choice(FACES)
            group = [t] * size if rng.random() < 0.5 else [t, t, t][:size] if size == 3 else [t] * 4
            if size == 3 and rng.random() < 0.5:  # 吃：顺子
                base = rng.choice([f for f in FACES if f[1] != "z" and f[0] in "1234567"])
                n = int(base[0])
                group = [f"{n}{base[1]}", f"{n + 1}{base[1]}", f"{n + 2}{base[1]}"]
        ankan = group[0] == "back"
        side_idx = rng.randrange(size) if not ankan and rng.random() < 0.85 else -1  # 副露约定含一张横置（暗杠除外）
        for i, c in enumerate(group):
            side = i == side_idx and c != "back"
            w = aspect if side else 1.0
            tiles.append(Tile(c, x + w / 2 + jitter(rng, 0.02), y_meld + jitter(rng, 0.04), side=side, rot=jitter(rng, 3)))
            x += w + rng.uniform(0, 0.06)
    return tiles


def indicator_rows(rng: random.Random, aspect: float, hand_left: float, above_used: bool) -> list[Tile]:
    """手牌上方的指示牌：上行表宝牌、下行里宝。y 为负（向上），单位牌高。above_used = 上方那行已放了副露，再往上一行。"""
    tiles: list[Tile] = []
    if rng.random() > 0.8:
        return tiles
    n = rng.choices([1, 2, 3, 4, 5], weights=[55, 25, 12, 5, 3])[0]
    rows = 2 if rng.random() < 0.4 else 1
    x0 = hand_left + rng.uniform(0, 2.0)
    lift = (1.2 + rng.uniform(0, 0.4)) * aspect if above_used else 0.0
    for r in range(rows):
        y = -lift - (1.15 + rng.uniform(0, 0.4)) * (rows - r) * aspect  # r=0 最上 = 表宝牌
        x = x0
        for _ in range(n):
            cls = "back" if rng.random() < 0.12 else rng.choice(FACES)
            tiles.append(Tile(cls, x + 0.5 + jitter(rng, 0.02), y + jitter(rng, 0.04), rot=jitter(rng, 3)))
            x += 1.0 + rng.uniform(0, 0.08)
    return tiles


def river(rng: random.Random, aspect: float, x0: float, y_bottom: float, cols: int = 6) -> list[Tile]:
    """6×n 牌河，最后一行不满；y_bottom 为最下一行的中心（负值向上），整块只会往上长。"""
    n = rng.randint(1, 18)
    rows = (n + cols - 1) // cols
    tiles: list[Tile] = []
    side_at = rng.randrange(n) if rng.random() < 0.3 else -1
    x, y = x0, y_bottom - (rows - 1) * aspect * 1.04
    col = 0
    for i in range(n):
        side = i == side_at
        w = aspect if side else 1.0
        tiles.append(Tile(rng.choice(FACES), x + w / 2 + jitter(rng, 0.02), y + jitter(rng, 0.03), side=side, rot=jitter(rng, 2)))
        x += w + rng.uniform(0, 0.05)
        col += 1
        if col == cols:
            col, x = 0, x0
            y += aspect * (1.0 + rng.uniform(0, 0.08))
    return tiles


def junk(rng: random.Random, area: tuple[float, float, float, float]) -> list[Tile]:
    x1, y1, x2, y2 = area
    return [
        Tile("back" if rng.random() < 0.15 else rng.choice(FACES), rng.uniform(x1, x2), rng.uniform(y1, y2), side=rng.random() < 0.3, rot=rng.uniform(-40, 40))
        for _ in range(rng.randint(3, 10))
    ]


def build_scene(rng: random.Random, aspect: float) -> list[Tile]:
    hand = hand_row(rng, aspect)
    tiles = list(hand)
    left = min(t.x for t in hand) - 0.5
    right = max(t.x for t in hand) + 0.5
    tiles += indicator_rows(rng, aspect, left, above_used=any(t.y < -0.5 for t in hand))
    top = min(t.y for t in tiles) - 0.5 * aspect
    if rng.random() < 0.5:
        tiles += river(rng, aspect, left + rng.uniform(0, max(0.5, right - left - 6)), top - aspect * rng.uniform(1.5, 3.5))
    if rng.random() < 0.3:
        tiles += junk(rng, (left - 2, top - aspect * 6, right + 2, top - aspect * 1.5))
    if rng.random() < 0.3:  # 邻家牌河：斜着放在更远处，一部分会被画面切掉
        far = min(t.y for t in tiles) - aspect * rng.uniform(2, 4)
        for t in river(rng, aspect, rng.uniform(left - 6, right), far - aspect * 2):
            t.rot += 90 * rng.choice([-1, 1]) if rng.random() < 0.5 else 0
            tiles.append(t)
    return tiles


# ---------- 渲染 ----------


def paste_tile(layer: Image.Image, sprite: Image.Image, cx: float, cy: float, tw: float, side: bool, rot: float, rng: random.Random):
    th = tw * sprite.height / sprite.width
    im = sprite.resize((max(2, int(round(tw))), max(2, int(round(th)))), Image.BILINEAR)
    im = ImageEnhance.Brightness(im).enhance(1 + jitter(rng, 0.12))
    if rng.random() < 0.3:
        im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 0.9)))
    angle = (90 * rng.choice([-1, 1]) if side else 0) + rot
    im = im.rotate(angle, expand=True, resample=Image.BICUBIC)
    mask = Image.new("L", (int(round(tw)), int(round(th))), 255).rotate(angle, expand=True, resample=Image.BILINEAR)
    # 阴影：同形状、偏移、羽化
    dx, dy = rng.uniform(-0.06, 0.06) * tw, rng.uniform(0.02, 0.09) * tw
    shadow = Image.new("RGBA", mask.size, (0, 0, 0, int(rng.uniform(60, 120))))
    shadow.putalpha(mask.point(lambda v: v * 0.6).filter(ImageFilter.GaussianBlur(tw * 0.05)))
    x0, y0 = int(round(cx - im.width / 2)), int(round(cy - im.height / 2))
    layer.alpha_composite(shadow, (int(x0 + dx), int(y0 + dy)))
    tile_rgba = im.convert("RGBA")
    tile_rgba.putalpha(mask)
    layer.alpha_composite(tile_rgba, (x0, y0))
    # 牌面四角（未旋转矩形绕中心旋转），供透视变换后取外接框
    hw, hh = (th / 2, tw / 2) if side else (tw / 2, th / 2)
    a = math.radians(-rot)  # PIL 逆时针为正
    corners = []
    for sx, sy in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)):
        corners.append((cx + sx * math.cos(a) - sy * math.sin(a), cy + sx * math.sin(a) + sy * math.cos(a)))
    return corners


def background(rng: random.Random, W: int, H: int) -> Image.Image:
    if BACKGROUNDS:
        bg = Image.open(rng.choice(BACKGROUNDS)).convert("RGB")
        s = max(W / bg.width, H / bg.height) * rng.uniform(1.0, 1.6)
        bg = bg.resize((int(bg.width * s) + 1, int(bg.height * s) + 1), Image.BILINEAR)
        x, y = rng.randint(0, bg.width - W), rng.randint(0, bg.height - H)
        bg = bg.crop((x, y, x + W, y + H))
        if rng.random() < 0.5:
            bg = bg.transpose(rng.choice([Image.FLIP_LEFT_RIGHT, Image.FLIP_TOP_BOTTOM, Image.ROTATE_180]))
        return bg
    base = np.array([rng.randint(40, 200) for _ in range(3)], dtype=np.float32)
    arr = np.tile(base, (H, W, 1))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    arr += (xx / W * jitter(rng, 40) + yy / H * jitter(rng, 40))[..., None]
    arr += rng.uniform(2, 12) * np.random.default_rng(rng.randrange(1 << 30)).standard_normal((H, W, 1))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def render(args) -> tuple[int, int]:
    idx, seed, out, W, H = args
    rng = random.Random(seed)
    if rng.random() < 0.25:
        W, H = H, W  # 竖拍
    aspect = float(np.median([s.height / s.width for s in SPRITES["1m"]]))
    tiles = build_scene(rng, aspect)
    xs = [t.x for t in tiles]
    # 线上输入是裁剪图，手牌（含下方副露、上方指示牌）通常撑满画面宽：以「刚好放下这部分」为上限再随机缩小；
    # 更远处的牌河/杂牌允许被画面切掉（标签按可见面积过滤）
    near = [t for t in tiles if -2.6 * aspect < t.y < 2.0 * aspect] or tiles
    span_x = max(t.x for t in near) - min(t.x for t in near) + 2
    fit = 0.94 * W / span_x
    tw = float(max(fit * rng.uniform(0.7, 1.0), 28))  # PIL 的滤镜参数不能是 numpy 标量
    # 手牌行放在画面下部 55%–85% 处，其余向上延伸
    hand_y = rng.uniform(0.55, 0.85) * H
    x_off = rng.uniform(0.04, max(0.05, 1 - span_x * tw / W - 0.04)) * W - min(xs) * tw + tw
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    polys = []
    for t in tiles:
        cx, cy = t.x * tw + x_off, hand_y + t.y * tw
        corners = paste_tile(layer, rng.choice(SPRITES[t.cls]), cx, cy, tw, t.side, t.rot, rng)
        polys.append((CLASSES.index(t.cls), corners))
    # 透视 + 旋转：对牌层做单应变换，背景不动
    ang = math.radians(jitter(rng, 8))
    ca, sa = math.cos(ang), math.sin(ang)
    src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    dst = []
    for x, y in src:
        x, y = x - W / 2, y - H / 2
        dst.append([x * ca - y * sa + W / 2 + jitter(rng, 0.04) * W, x * sa + y * ca + H / 2 + jitter(rng, 0.04) * H])
    Hm = cv2.getPerspectiveTransform(src, np.float32(dst))
    warped = cv2.warpPerspective(np.array(layer), Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    canvas = background(rng, W, H).convert("RGBA")
    canvas.alpha_composite(Image.fromarray(warped))
    img = canvas.convert("RGB")
    # 全图光照
    img = ImageEnhance.Brightness(img).enhance(1 + jitter(rng, 0.25))
    img = ImageEnhance.Contrast(img).enhance(1 + jitter(rng, 0.2))
    img = ImageEnhance.Color(img).enhance(1 + jitter(rng, 0.25))
    arr = np.asarray(img).astype(np.float32)
    arr *= np.array([1 + jitter(rng, 0.08), 1 + jitter(rng, 0.04), 1 + jitter(rng, 0.08)], dtype=np.float32)  # 色温
    arr += np.random.default_rng(seed).standard_normal(arr.shape).astype(np.float32) * rng.uniform(0, 6)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    if rng.random() < 0.6:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.2, 1.2)))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=rng.randint(65, 95))
    (out / "train/images" / f"synth_{idx:06d}.jpg").write_bytes(buf.getvalue())
    # 标签：四角过单应 → 外接框 → 裁到画面内，可见面积 < 50% 的丢弃
    lines = []
    for cls_id, corners in polys:
        pts = cv2.perspectiveTransform(np.float32([corners]), Hm)[0]
        x1, y1 = pts[:, 0].min(), pts[:, 1].min()
        x2, y2 = pts[:, 0].max(), pts[:, 1].max()
        cx1, cy1, cx2, cy2 = max(0, x1), max(0, y1), min(W, x2), min(H, y2)
        if cx2 <= cx1 or cy2 <= cy1 or (cx2 - cx1) * (cy2 - cy1) < 0.5 * (x2 - x1) * (y2 - y1):
            continue
        lines.append(f"{cls_id} {(cx1 + cx2) / 2 / W:.6f} {(cy1 + cy2) / 2 / H:.6f} {(cx2 - cx1) / W:.6f} {(cy2 - cy1) / H:.6f}")
    (out / "train/labels" / f"synth_{idx:06d}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(polys), len(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=5000)
    ap.add_argument("--out", default=str(ML / "data/raw/synth"))
    ap.add_argument("--sprites", default=str(ML / "data/sprites"))
    ap.add_argument("--backgrounds", default=str(ML / "data/backgrounds"))
    ap.add_argument("--size", type=int, default=1280, help="长边像素")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    load_assets(Path(args.sprites), Path(args.backgrounds))  # 主进程先加载：校验贴图齐全
    out = Path(args.out)
    for sub in ("train/images", "train/labels"):
        (out / sub).mkdir(parents=True, exist_ok=True)
    names = "\n".join(f"  {i}: {c}" for i, c in enumerate(CLASSES))
    (out / "data.yaml").write_text(f"# synth.py 生成；类名与 manifest 一致\ntrain: train/images\nval: train/images\nnames:\n{names}\n", encoding="utf-8")
    W, H = args.size, int(args.size * 3 / 4)
    jobs = [(i, args.seed * 1_000_003 + i, out, W, H) for i in range(args.n)]
    print(f"{len(SPRITES['1m'])} sprites/class, {len(BACKGROUNDS)} backgrounds{' (synthetic backgrounds)' if not BACKGROUNDS else ''}")
    # macOS 的子进程是 spawn 出来的，不继承全局变量：每个 worker 自己加载贴图
    with Pool(args.workers, initializer=load_assets, initargs=(Path(args.sprites), Path(args.backgrounds))) as pool:
        stats = pool.map(render, jobs, chunksize=16)
    print(f"{args.n} images -> {out}; tiles placed {sum(a for a, _ in stats)}, boxes kept {sum(b for _, b in stats)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
