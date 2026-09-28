#!/usr/bin/env python3
"""生成 e2e 用的假检测器 e2e/fixtures/detector.onnx：忽略输入，恒定输出一副固定手牌的检测框。
形状与真模型一致（输入 images [1,3,640,640]，输出 output0 [1,300,6]，letterbox 640 坐标），
所以 Playwright 只需把 CDN 的模型 URL 换成这个文件，手机端从 onnxruntime-web 到布局、算番、回填真值
整条链路都是真的跑。手牌：123m 4筒 赤5筒 6筒 789s 789m 22p，和张 9m 横放右端（平和 + 赤 = 2 番 30 符），
赤 5 筒置信度 0.45（介于 layout 的 minConf 0.4 与 lowConf 0.5 之间）：仍参与布局，但界面会给它打「请核对」记号。
改了手牌要同步改 e2e/recognize.spec.ts。
--drop-win：去掉和张、恒定只有 13 张，写到 e2e/fixtures/detector-13.onnx。永远凑不满 14 张就永远不会定格，
e2e 靠它走「放弃取景」这条路（张数提示、倒计时不出现、摘要与采样帧上传）。
用法：uv run scripts/e2e_detector.py [--drop-win]"""

import argparse
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper

ML = Path(__file__).resolve().parent.parent
MANIFEST = ML.parent / "packages/core/src/recognition/manifest.json"
FIXTURES = ML.parent / "e2e/fixtures"

ROW = ["1m", "2m", "3m", "4p", "0p", "6p", "7s", "8s", "9s", "7m", "8m", "2p", "2p"]
WIN = "9m"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--drop-win", action="store_true", help="不输出和张（恒定 13 张）")
    args = ap.parse_args()
    out_path = FIXTURES / ("detector-13.onnx" if args.drop_win else "detector.onnx")
    classes: list[str] = json.loads(MANIFEST.read_text(encoding="utf-8"))["classes"]
    rows = []
    x = 12.0
    for i, name in enumerate(ROW):
        rows.append([x, 300, x + 40, 356, 0.45 if name == "0p" else 0.9, classes.index(name)])
        x += 42
    if not args.drop_win:
        rows.append([x, 308, x + 56, 348, 0.9, classes.index(WIN)])
    out = np.zeros((1, 300, 6), dtype=np.float32)
    out[0, : len(rows)] = rows
    value = helper.make_tensor("v", TensorProto.FLOAT, out.shape, out.flatten().tolist())
    graph = helper.make_graph(
        [helper.make_node("Constant", [], ["output0"], value=value)],
        "constant_detector",
        [helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 640, 640])],
        [helper.make_tensor_value_info("output0", TensorProto.FLOAT, [1, 300, 6])],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], producer_name="riichi-e2e")
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, out_path)
    print(f"{out_path} ({out_path.stat().st_size} bytes), {len(rows)} boxes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
