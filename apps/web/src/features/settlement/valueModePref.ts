import type { ValueDraft } from "./valueDraft";

/** 本机记住和牌价值录入停在哪一页（番符 / 牌面）：用户手动切页签时写，新开结算草稿时读。 */
const KEY = "riichi.settlement.valueMode";

export function readValueMode(): ValueDraft["mode"] {
  try {
    return localStorage.getItem(KEY) === "hand" ? "hand" : "manual";
  } catch {
    return "manual";
  }
}

export function writeValueMode(mode: ValueDraft["mode"]): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* 私密模式等场景忽略 */
  }
}
