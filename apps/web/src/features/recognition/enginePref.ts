import type { RecognitionEngine } from "@riichi/core";

/** 手机本地的识别引擎偏好：本机（浏览器 WASM）或服务器。 */
const KEY = "riichi.recognition.engine";

export function readEnginePref(): RecognitionEngine {
  try {
    return localStorage.getItem(KEY) === "server" ? "server" : "browser";
  } catch {
    return "browser";
  }
}

export function writeEnginePref(engine: RecognitionEngine): void {
  try {
    localStorage.setItem(KEY, engine);
  } catch {
    /* 私密模式等场景忽略 */
  }
}
