#!/usr/bin/env python3
"""从「全家福」照片抠出每类牌的贴图，供 synth.py 合成训练集。
全家福 = 一张照片里 38 类各恰好一枚（含牌背），拍不同光线/角度/背景各一张。

流程：模型检测 → 每类取置信度最高的框（多出的框打印为可疑）→ 框内找牌面轮廓、最小外接矩形 →
整张照片的牌共用同一个旋转角（取中位数），方向由多数牌「转正后高大于宽」投票决定 →
转正后紧贴裁剪 → data/sprites/<class>/<图名>.png；
每张图另存 data/sprites/contact_<图名>.jpg 拼图供肉眼核对：认错的把 png 挪到正确类目录或删掉，
然后 --contact-only 按目录现状重画拼图再核对一遍。
模型认不出牌背时按「饱和度高于白牌面」的色块兜底。
用法：uv run scripts/sprites.py <weights> data/family [--out data/sprites] [--conf 0.25]
      uv run scripts/sprites.py --contact-only [--out data/sprites]"""

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ML = Path(__file__).resolve().parent.parent
MANIFEST = ML.parent / "packages/core/src/recognition/manifest.json"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
MARGIN = 0.15
INSET = 0.03


def measure(img: np.ndarray, box, by_saturation: bool):
    """框内找牌面轮廓，返回 (patch, cx, cy, rw, rh, angle)；angle 为 OpenCV minAreaRect 的 (0, 90]。找不到返回 None。"""
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    X1, Y1 = max(0, int(x1 - w * MARGIN)), max(0, int(y1 - h * MARGIN))
    X2, Y2 = min(img.shape[1], int(x2 + w * MARGIN)), min(img.shape[0], int(y2 + h * MARGIN))
    patch = img[Y1:Y2, X1:X2]
    channel = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)[..., 1] if by_saturation else cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(cv2.GaussianBlur(channel, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) > 0.3 * w * h]
    if not contours:
        return None
    (cx, cy), (rw, rh), angle = cv2.minAreaRect(max(contours, key=cv2.contourArea))
    return patch, cx, cy, rw, rh, angle


def fallback_crop(img: np.ndarray, box):
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    return img[int(y1 + h * INSET) : int(y2 - h * INSET), int(x1 + w * INSET) : int(x2 - w * INSET)]


def warp(m, theta: float):
    """按 theta 旋转 patch 后裁出矩形；theta 是 angle 或 angle±90，后者裁出的宽高互换。"""
    patch, cx, cy, rw, rh, angle = m
    if abs(theta - angle) > 1e-6:
        rw, rh = rh, rw
    rot = cv2.getRotationMatrix2D((cx, cy), theta, 1.0)
    rotated = cv2.warpAffine(patch, rot, (patch.shape[1], patch.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    sx1, sy1 = int(cx - rw / 2 + rw * INSET), int(cy - rh / 2 + rh * INSET)
    sx2, sy2 = int(cx + rw / 2 - rw * INSET), int(cy + rh / 2 - rh * INSET)
    if sx1 < 0 or sy1 < 0 or sx2 > rotated.shape[1] or sy2 > rotated.shape[0] or sx2 - sx1 < 10 or sy2 - sy1 < 10:
        return None
    return rotated[sy1:sy2, sx1:sx2]


def rectify_all(img: np.ndarray, boxes: dict[str, tuple]) -> dict[str, np.ndarray]:
    """boxes: class → box。整张图共用旋转角：angle 取中位数，方向按多数牌转正后高>宽投票。"""
    measured = {name: measure(img, box, by_saturation=(name == "back")) for name, box in boxes.items()}
    angles = [m[5] for m in measured.values() if m]
    out = {}
    if angles:
        # 角度可能同时贴近 0 和 90（同一姿态的两种表示）：统一折到中位数附近
        med = float(np.median(angles))
        folded = [a if abs(a - med) <= 45 else (a - 90 if a > med else a + 90) for a in angles]
        g = float(np.median(folded))
        # 对每张牌，theta ∈ {angle, angle-90} 中取最接近 g 的；投票看该选择下是否高>宽
        votes = 0
        for m in measured.values():
            if not m:
                continue
            _, _, _, rw, rh, angle = m
            theta = angle if abs(angle - g) <= abs(angle - 90 - g) else angle - 90
            hgt, wid = (rh, rw) if theta == angle else (rw, rh)
            votes += 1 if hgt > wid else -1
        if votes < 0:  # 多数牌横着：全局再转 90°
            g = g - 90 if g > 0 else g + 90
        for name, m in measured.items():
            if not m:
                continue
            angle = m[5]
            # angle±90 与 angle 是同一姿态的另一种表示（宽高互换），取最接近全局角的那个
            theta = min((angle, angle - 90, angle + 90), key=lambda t: abs(t - g))
            sp = warp(m, theta)
            if sp is not None:
                out[name] = sp
    for name, box in boxes.items():
        if name not in out:
            out[name] = fallback_crop(img, box)
    return out


def find_back(img: np.ndarray, taken: list, area_ref: float):
    """牌背兜底：饱和度明显高于白色牌面的色块，面积与其它牌相当，且不与已检测的框重叠。"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = ((hsv[..., 1] > 60) & (hsv[..., 2] > 120)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask)
    best = None
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if not (0.5 * area_ref < bw * bh < 2.0 * area_ref) or not (0.4 < bw / bh < 2.5):
            continue
        box = (x, y, x + bw, y + bh)
        if any(not (box[2] < t[0] or box[0] > t[2] or box[3] < t[1] or box[1] > t[3]) for t in taken):
            continue
        fill = area / (bw * bh)
        if best is None or fill > best[0]:
            best = (fill, box)
    return best[1] if best else None


def contact_sheet(sprites: dict, classes: list, path: Path, cell=90):
    cols = 10
    rows = (len(classes) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), "white")
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(classes):
        x, y = (i % cols) * cell, (i // cols) * (cell + 18)
        if name in sprites:
            im = Image.fromarray(cv2.cvtColor(sprites[name], cv2.COLOR_BGR2RGB))
            im.thumbnail((cell - 6, cell - 6))
            sheet.paste(im, (x + 3, y + 3))
        else:
            d.rectangle((x + 3, y + 3, x + cell - 3, y + cell - 3), outline="red", width=3)
        d.text((x + 4, y + cell + 2), name, fill="black")
    sheet.save(path, quality=90)


def redraw_contacts(out: Path, classes: list[str]) -> int:
    """按 data/sprites/<class>/<图名>.png 的现状重画每张图的拼图（手工挪动/删除之后用）。"""
    stems = sorted({p.stem for c in classes for p in (out / c).glob("*.png")})
    for stem in stems:
        sprites = {c: cv2.imread(str(out / c / f"{stem}.png")) for c in classes if (out / c / f"{stem}.png").exists()}
        contact_sheet(sprites, classes, out / f"contact_{stem}.jpg")
        print(f"{stem}: {len(sprites)} sprites, missing {[c for c in classes if c not in sprites]}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("weights", nargs="?")
    ap.add_argument("images", nargs="?")
    ap.add_argument("--out", default=str(ML / "data/sprites"))
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--contact-only", action="store_true", help="不检测，只按目录现状重画拼图")
    args = ap.parse_args()

    classes: list[str] = json.loads(MANIFEST.read_text(encoding="utf-8"))["classes"]
    if args.contact_only:
        return redraw_contacts(Path(args.out), classes)
    if not args.weights or not args.images:
        ap.error("weights and images are required unless --contact-only")
    images = sorted(p for p in Path(args.images).iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not images:
        print(f"no images in {args.images}", file=sys.stderr)
        return 1
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    from ultralytics import YOLO

    model = YOLO(args.weights)
    total = 0
    for path in images:
        res = model.predict(str(path), imgsz=640, conf=args.conf, verbose=False)[0]
        img = cv2.imread(str(path))
        best: dict[str, tuple[float, tuple]] = {}
        dupes = []
        for box, conf, cls in zip(res.boxes.xyxy.tolist(), res.boxes.conf.tolist(), res.boxes.cls.tolist()):
            name = res.names[int(cls)]
            box = tuple(int(v) for v in box)
            if name not in best or conf > best[name][0]:
                if name in best:
                    dupes.append((name, round(best[name][0], 2)))
                best[name] = (conf, box)
            else:
                dupes.append((name, round(conf, 2)))
        if "back" not in best and best:
            area_ref = float(np.median([(b[2] - b[0]) * (b[3] - b[1]) for _, b in best.values()]))
            box = find_back(img, [b for _, b in best.values()], area_ref)
            if box:
                best["back"] = (0.0, box)
        sprites = rectify_all(img, {name: box for name, (_, box) in best.items()})
        for name, sp in sprites.items():
            (out / name).mkdir(exist_ok=True)
            cv2.imwrite(str(out / name / f"{path.stem}.png"), sp)
        total += len(sprites)
        missing = [c for c in classes if c not in sprites]
        contact_sheet(sprites, classes, out / f"contact_{path.stem}.jpg")
        print(f"{path.name}: {len(sprites)} sprites, missing {missing}, dropped duplicates {dupes}")
    print(f"{total} sprites -> {out}; check contact_*.jpg and fix wrong ones")
    return 0


if __name__ == "__main__":
    sys.exit(main())
