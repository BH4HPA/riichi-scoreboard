# 牌面检测模型训练工作台

拍照识别牌型的模型侧：把照片里的每张牌检测出来（YOLO11n，38 类），检测框→手牌的布局规则在 `packages/core/src/recognition/` 里由前后端共用，这里不复刻。

类目录的唯一真源是 `packages/core/src/recognition/manifest.json` 的 `classes`（下标 = 类 id）：`1m…9m 0m 1p…9p 0p 1s…9s 0s 1z…7z back`，`0` = 赤五，`z` 依次 东南西北白发中，`back` = 牌背。`configs/tiles.yaml` 与 `configs/label_studio.xml` 由 `scripts/gen_classes.py` 生成，CI 用 `--check` 校验它们与 manifest 一致。

## 环境

```bash
cd ml
uv sync                      # Python 3.11–3.13（uv 会自行下载），装 ultralytics / onnx / onnxruntime / roboflow
uv tool install label-studio # 标注工具单独隔离安装，不与训练环境混
```

Apple Silicon 训练用 `device=mps`；`scripts/train.sh` 已设置 `PYTORCH_ENABLE_MPS_FALLBACK=1`。

## 流程

### 1. 公开数据集 → v0

```bash
export ROBOFLOW_API_KEY=…            # universe.roboflow.com → Settings → API Key
uv run scripts/fetch_public.py       # 下载到 data/raw/<name>/，见脚本里的 DATASETS
uv run scripts/remap.py              # 首次会给每个来源起草 configs/remap/<name>.json 并退出
```

打开 `configs/remap/<name>.json`：键是来源类名，值填 canonical 类名，填 `null` 丢弃该类。补全后再跑一次 `remap.py`，得到 `data/merged/`（按来源分层抽 10% 作 val，文件名带来源前缀）。末尾会打印每类框数，任何一类为 0 都要回头查映射。

`jaheel/MJOD-2136` 不在 Roboflow 上：手动 clone 后转成 YOLO 目录放进 `data/raw/mjod2136/`（需要 `data.yaml` 或 `classes.txt`），同样走 remap。

```bash
scripts/train.sh v0                  # runs/v0/weights/best.pt；看 runs/v0/results.png 的 mAP50 / mAP50-95
```

### 2. 导出 ONNX → 发布

```bash
scripts/export.sh runs/v0/weights/best.pt   # nms=True batch=1 imgsz=640；随后自动跑 check_onnx.py
uv run scripts/check_onnx.py runs/v0/weights/best.onnx data/bench/某张.jpg   # 看单图耗时与前几框
QCLOUD_SECRET_ID=… QCLOUD_SECRET_KEY=… ../ci/upload-model.sh runs/v0/weights/best.onnx "v0 public"
```

上传脚本打印的片段粘到 `packages/core/src/recognition/manifest.json` 的 `model` 字段，推 `main` 即发布（手机直接从 CDN 取模型，服务端启动时按 sha256 校验下载）。对象名是新 uuid，旧模型不会被覆盖。

### 3. 自家牌 → v1（微调）

按摆牌约定拍 300–500 张（`packages/core/src/recognition/` 的 README 或 CLAUDE.md「拍照识别」一节），放 `data/own/`。另拍 30–50 张放 `data/bench/`，每张配同名 `.hand.json` 作整手牌评估的真值（评估脚本在 `apps/server/scripts/recognize-bench.ts`）。

```bash
uv run scripts/prelabel.py runs/v0/weights/best.pt data/own      # → data/own_prelabel.json
LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED=true \
LABEL_STUDIO_LOCAL_FILES_DOCUMENT_ROOT="$PWD/data" label-studio start
```

Label Studio 里：新建项目 → Labeling Interface 粘 `configs/label_studio.xml` → Import 选 `data/own_prelabel.json`（预测框会显示为 prediction，逐张修正提交）→ Export 选 YOLO，解压到 `data/raw/own/`（含 `classes.txt`）。然后：

```bash
uv run scripts/remap.py                                     # own 并入 merged
scripts/train.sh v1 model=runs/v0/weights/best.pt epochs=60 # 从 v0 微调
scripts/export.sh runs/v1/weights/best.pt
```

### 4. 线上纠错回流

线上每次识别都会留存照片、检测框与用户最终确认的手牌（`recognitions` 表 + COS `riichi/hands/`）。导出后同样走 预标注 → 修正 → remap → 微调，脚本在下一阶段补。

## 指标

- `yolo val` 的 mAP50 / mAP50-95：单牌检测质量。
- 整手牌完全正确率：真实 TS 管线（letterbox → 模型 → 布局规则）在 `data/bench/` 上的精确匹配比例，这是上线门槛（目标 ≥ 90%）。

## 目录

```
configs/tiles.yaml, label_studio.xml   生成物（gen_classes.py）
configs/remap/<name>.json              来源类名 → canonical 映射（入库）
scripts/                               上面用到的脚本
data/raw|merged|own|bench              不入库
runs/                                  训练产物，不入库
```
