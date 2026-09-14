import { createRequire } from "node:module";
import {
  DomainError,
  fromEngineOutput,
  toEngineInput,
  type EngineInput,
  type EngineOutput,
  type EvaluatedHand,
  type HandContext,
  type HandInput,
  type RoomRules,
} from "@riichi/core";

const require = createRequire(import.meta.url);
const engine = require("riichi-rs-node") as { calc: (input: EngineInput) => EngineOutput };

/** 牌面 → 番/符/役（服务端唯一的引擎入口）。 */
export function evaluateHand(hand: HandInput, ctx: HandContext, rules: RoomRules): EvaluatedHand {
  const input = toEngineInput(hand, ctx, rules);
  let output: EngineOutput;
  try {
    output = engine.calc(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 引擎把"无役"当作错误抛出；对计分板而言这是"不是和牌形"的正常结果
    if (/no yaku/i.test(message)) {
      return { han: 0, fu: 0, yakuman: 0, yaku: {}, isAgari: false, reason: "noYaku" };
    }
    throw new DomainError("bad_hand", `牌型无效：${message}`);
  }
  return fromEngineOutput(output, rules);
}
