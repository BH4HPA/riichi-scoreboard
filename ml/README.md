# 牌面检测模型训练工作台

拍照识别牌型的模型侧：把照片里的每张牌检测出来（YOLO11n，38 类）。检测框→手牌的布局规则、手机/服务端推理、照片留存与回流都属于应用侧，在后续 PR 里接入，这里只管数据、训练、导出、发布。

类目录的唯一真源是 `packages/core/src/recognition/manifest.json` 的 `classes`（下标 = 类 id）：`1m…9m 0m 1p…9p 0p 1s…9s 0s 1z…7z back`，`0` = 赤五，`z` 依次 东南西北白发中，`back` = 牌背。`configs/tiles.yaml` 与 `configs/label_studio.xml` 由 `scripts/gen_classes.py` 生成，CI 用 `--check` 校验它们与 manifest 一致；`configs/remap/*.json` 是手工维护的来源类名映射，入库。

## 环境

```bash
cd ml
uv sync                      # Python 3.11–3.13（uv 会自行下载），装 ultralytics / onnx / onnxruntime / roboflow
uv tool install label-studio # 标注工具单独隔离安装，不与训练环境混
```

脚本都从 `ml/` 目录调用；`train.sh` 默认 Apple Silicon（`DEVICE=mps`），有 CUDA 时 `DEVICE=0`。

## 流程

### 1. 公开数据集 → v0

```bash
export ROBOFLOW_API_KEY=…            # universe.roboflow.com → Settings → API Key
uv run scripts/fetch_public.py       # 下载到 data/raw/<name>/，见脚本里的 DATASETS
uv run scripts/remap.py              # 首次会给每个缺映射的来源起草 configs/remap/<name>.json 并退出（返回码 2）
```

打开 `configs/remap/<name>.json`：键是来源类名，值填 canonical 类名，填 `null` 丢弃该类。补全后再跑 `remap.py`，得到 `data/merged/`：来源自带 train/valid/test 划分的沿用其划分（valid 与 test 都作 val，Roboflow 的 train 里常有同一原图的增强副本，随机重切会泄漏进 val 抬高 mAP），没有划分的按固定种子抽 10% 作 val；文件名带来源前缀。末尾打印每类框数，任何一类为 0 都要回头查映射。

`jaheel/MJOD-2136` 不在 Roboflow 上：手动 clone 后转成 YOLO 目录放进 `data/raw/mjod2136/`（需要 `data.yaml` 或 `classes.txt`），同样走 remap。

```bash
scripts/train.sh v0                  # runs/v0/weights/best.pt；看 runs/v0/results.png 的 mAP50 / mAP50-95
```

### 2. 导出 ONNX → 发布

```bash
scripts/export.sh runs/v0/weights/best.pt      # nms=True batch=1 imgsz=640；随后自动跑 check_onnx.py
uv run scripts/check_onnx.py runs/v0/weights/best.onnx data/bench/某张.jpg   # 看单图耗时与前几框
QCLOUD_SECRET_ID=… QCLOUD_SECRET_KEY=… ../ci/upload-model.sh runs/v0/weights/best.onnx "v0 public"
```

`check_onnx.py` 除了形状，还比对 ONNX 元数据里的类顺序与 manifest 是否逐位相同——形状对但顺序错不会报错、只会静默认错牌，这是唯一能机器验证类契约的地方。`upload-model.sh` 先跑这个校验，再上传到 `riichi/models/<新 uuid>.onnx`，最后把 `{id, sha256, imgsz, publishedAt, note}` 写回 manifest 的 `model`；提交并推 `main` 即发布。旧对象不会被覆盖，回滚 = manifest 指回旧 id。

### 3. 自家牌 → v1（微调）

按摆牌约定（见根目录 CLAUDE.md「Photo recognition」）拍 300–500 张放 `data/own/`；另拍 30–50 张放 `data/bench/`，每张配同名 `.hand.json` 作整手牌评估的真值（评估脚本随应用侧一起来）。

```bash
uv run scripts/prelabel.py runs/v0/weights/best.pt data/own      # → data/own_prelabel.json
LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED=true \
LABEL_STUDIO_LOCAL_FILES_DOCUMENT_ROOT="$PWD/data" label-studio start
```

Label Studio 里：新建项目 → Labeling Interface 粘 `configs/label_studio.xml` → Import 选 `data/own_prelabel.json`（预测框会显示为 prediction，逐张修正提交）→ Export 选 YOLO，解压到 `data/raw/own/`（含 `classes.txt`）。然后：

```bash
uv run scripts/remap.py                                     # own 并入 merged（首次同样会起草 configs/remap/own.json）
scripts/train.sh v1 model=runs/v0/weights/best.pt epochs=60 # 从 v0 微调
scripts/export.sh runs/v1/weights/best.pt
```

### 4. 线上纠错回流（下一阶段）

应用侧接入后，每次识别会留存照片、检测框与用户最终确认的手牌；导出后同样走 预标注 → 修正 → remap → 微调。导出脚本届时补。

## 指标

- `yolo val` 的 mAP50 / mAP50-95：单牌检测质量，选 epoch、比较 v0/v1 用。
- 整手牌完全正确率：真实推理管线在 `data/bench/` 上的精确匹配比例，是上线门槛（目标 ≥ 90%）；评估脚本随应用侧接入一起来。

## 目录

```
configs/tiles.yaml, label_studio.xml   生成物（gen_classes.py，CI --check）
configs/remap/<name>.json              来源类名 → canonical 映射（手工维护，入库）
scripts/                               上面用到的脚本
data/raw|merged|own|bench              不入库
runs/                                  训练产物，不入库
```
