# 牌面检测模型训练工作台

拍照识别牌型的模型侧：把照片里的每张牌检测出来（YOLO11n，38 类）。检测框→手牌的布局规则（`packages/core/src/recognition/layout.ts`）、手机浏览器推理与照片留存在应用侧（`apps/web/src/features/recognition`），线上纠错回流见下文第 4 节；这里只管数据、训练、导出、发布。

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

### 3. 自家牌 → v1（合成 + 微调）

真图不用拍几百张，主力是剪贴合成：

```bash
uv run scripts/family_check.py runs/v0/weights/best.pt data/family/*.jpg   # 先看 v0 认不认你的牌（每张全家福 38 类各一枚）
uv run scripts/sprites.py runs/v0/weights/best.pt data/family             # 抠贴图 → data/sprites/<class>/；看 contact_*.jpg 核对，认错的挪目录或删掉
uv run scripts/sprites.py --contact-only                                   # 手工改完贴图目录后按现状重画 contact_*.jpg 再核对
uv run scripts/synth.py --n 5000                                           # 合成 → data/raw/synth/（只进 train）
uv run scripts/bench_dets.py runs/v1/weights/best.onnx data/bench/dets-v1.json   # 评估集出检测框 →
(cd .. && yarn workspace @riichi/server exec tsx scripts/recognize-bench.ts "$PWD/data/bench/truth.txt" "$PWD/data/bench/dets-v1.json")  # 布局 + 真值 → 整手牌正确率；--dump IMG_xxxx 看单张
uv run scripts/e2e_detector.py                                             # 改了 e2e 的固定手牌时重建 e2e/fixtures/detector.onnx
uv run scripts/remap.py                                                    # 与公开集合并
scripts/train.sh v1 model=runs/v0/weights/best.pt epochs=60
```

要拍的真图：全家福 6–10 张（换光线/角度/背景，每张 38 类各一枚，是贴图来源）；空背景 10–15 张放 `data/backgrounds/`（桌面/桌布/麻将垫的空镜头，**上面不能有牌**，可带风位盒、点棒）；评估集 30–50 张放 `data/bench/`，按裁剪后的样子拍（只有手牌、副露和指示牌），真值写在 `data/bench/truth.txt`（一行一张，格式见文件头注释；认不出的 token 视为备注 = 负例，不计入正确率）。另外 20–30 张带牌河的真实全景放 `data/own/`，走下面的预标注流程混进训练集，校正合成与真实的差距。

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

### 4. 线上纠错回流

每次识别都留存了定格帧、检测框与用户最终确认的手牌（`recognitions` 表，`source` 区分房间结算 `room`、已下线的开发者标注页 `label` 与拍照算点数页 `calc`）。
判据是 `corrected IS NOT NULL`：房间来的记录只有结算命令被接受之后才回填，而牌桌上另外三个人不会允许
错误的牌局录进系统——「触发了结算」本身就是一次人力校验，**不看用户改没改过**。`label` 是开发者逐张改到全对才提交的；`calc` 在玩家点「识别正确」时回填，没有牌桌把关，玩家可能对不影响点数的错牌（比如宝牌指示牌）照点不误，导入时可用 `--source` 分开看。

```bash
# 1. 把线上库拷到本机（运行镜像里没有脚本也没有 core，导出在本机跑）
#    先 checkpoint：WAL 模式下最近的写还在 -wal 里，直接拷主库会丢掉刚打的那几局
ssh <server> "docker exec riichi-scoreboard-riichi-1 node --input-type=module -e \
  \"const {DatabaseSync} = await import('node:sqlite'); const d = new DatabaseSync('/data/riichi.sqlite'); \
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); d.close()\" \
  && docker cp riichi-scoreboard-riichi-1:/data/riichi.sqlite /tmp/riichi.sqlite"
scp <server>:/tmp/riichi.sqlite /tmp/

# 2. 导出（位置对齐在 TS 侧做，见 apps/server/src/recognition/align.ts）
yarn workspace @riichi/server exec tsx scripts/export-recognitions.ts /tmp/riichi.sqlite > records.ndjson

# 3. 拉照片、归一化、落盘
uv run scripts/import_records.py records.ndjson      # 照片走 COS；本地库加 --photos <DATA_DIR/objects>
uv run scripts/remap.py                              # records 并入 merged
```

导出把每条记录分成两队：

- **auto** —— 改动确实是**逐位替换**（不是编辑态删一张再补一张那种整体错位）、指示牌张数两边完全相等、
  且每个检测框要么被布局采信、要么被判为误检（低置信、形状退化的框不是牌，不标注才对），
  且没有「赤五改成普通五」、没有布局猜过的补牌（见下面第 1 条）。
  写进 `data/raw/records/{images,labels}/`。
- **manual** —— 其余全部，带预标注进 `data/raw/records/pending/`，喂 Label Studio 人工补。

注意这里有**两层判据，别混为一谈**：一条记录**可不可信**，看结算有没有被牌桌接受（`corrected IS NOT NULL`）；
可不可信与**能不能自动转成框级标注**是两回事——后者只看位置对不对得上。对不上的那些真值依然可靠，
只是要人工把框补对，所以它们进的是人工队列而不是废纸篓。

**先啃人工队列再训练。** 自动那条全是模型已经做对的样本，只喂它会把训练集越练越窄（自训练陷阱）；
真正涨点的是漏检误检的难例。脚本会把两队的数量与占比打出来。

几个容易踩的坑，对齐时已经处理：

1. **赤五改成普通五就送人工**。它有两种成因、从记录里分不开（`recognitions` 没存房间规则）：
   不用赤五的房间把照片里的赤五折回了普通五（该保留 `0p`），或者用户在纠正认错、`applyRecognized`
   按每色上限折掉了超额的赤五（该标 `5p`）。猜错哪边都是把错标签写进没人复核的 auto 队列。
   反方向（用户把普通五改成赤五）只可能是纠正，照常自动重标。
   同理，**布局猜过的牌**（暗杠中间两张不一致、白板杠里一张认成牌背后按同牌补齐）也送人工：
   落选或认错的那个框被采信了却没有对应位置，照单全收会带着模型原判进 auto（白板框标成 `back`）。
2. **指示牌张数少一张就送人工**。实拍遇到过牌背被认成白板混进指示牌行、用户在编辑态删掉的情况；
   如果只比「两边都有的部分」，删的又是靠前那张，后面的真牌会顶上来，那个误检框会被改标成真牌的类——
   一张照片里出现两个同类框，其中一个其实是牌背，等于把已知的混淆喂回去强化一遍。村规截断同样送人工：
   被截掉的那几张用户根本没在界面上见过，拿模型的预测当真值是在写没验证过的东西。
3. **多一张也送人工**：说明模型漏检了，照片里有张牌没有任何框，YOLO 会把它学成背景。
   里宝行比表宝行长同理：布局截掉了多出来的位置，那几个框没人看过，送人工。
4. **同一张牌连排的末尾被改就送人工**。编辑态删一张再补一张，若删的那张在一段延伸到末尾的同牌连排里，
   结果只有末位不同，「位置差异数 == 多重集差异数」这道判据挡不住，和直接改末位分不开。
5. **auto 不输出被布局剔除的框**（低于 minConf、零面积、形状退化）。模型导出门槛是 0.25，
   0.25–0.4 的误检真会进记录；带着模型原判写出去等于把误检当真牌教回去。人工队列仍带着它们。

## 指标

- `yolo val` 的 mAP50 / mAP50-95：单牌检测质量，选 epoch、比较 v0/v1 用。
- 整手牌完全正确率：`bench_dets.py` + `recognize-bench.ts` 在 `data/bench/` 上的精确匹配比例（暗牌 + 和张 + 副露 + 指示牌全对），是上线门槛（目标 ≥ 90%）。v1 + 当前布局规则：32/33（唯一失败是没裁剪、带牌河的照片），v0：18/33。

## 目录

```
configs/tiles.yaml, label_studio.xml   生成物（gen_classes.py，CI --check）
configs/remap/<name>.json              来源类名 → canonical 映射（手工维护，入库）
scripts/                               上面用到的脚本（sprites.py / synth.py 是合成训练集这条线）
data/family|backgrounds|sprites        全家福、空背景、抠出的贴图，不入库
data/raw|merged|own|bench              不入库
runs/                                  训练产物，不入库
```
