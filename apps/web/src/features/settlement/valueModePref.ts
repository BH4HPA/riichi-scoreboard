import { readLocal, writeLocal } from "@/lib/localStore";
import type { ValueDraft } from "./valueDraft";

/** 本机记住和牌价值录入停在哪一页（番符 / 牌面）：用户手动切页签时写，新开结算草稿时读。 */
const KEY = "riichi.settlement.valueMode";

export function readValueMode(): ValueDraft["mode"] {
  return readLocal(KEY) === "hand" ? "hand" : "manual";
}

export const writeValueMode = (mode: ValueDraft["mode"]) => writeLocal(KEY, mode);
