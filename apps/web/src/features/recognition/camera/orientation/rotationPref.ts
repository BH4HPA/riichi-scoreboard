import { readLocal, writeLocal } from "@/lib/localStore";
import type { Rotation } from "./upright";

const KEY = "riichi.camera.rotation";

/** 上次取景时界面的方向：习惯横着拍的人，下次打开就是横的 */
export function readRotation(): Rotation {
  const raw = readLocal(KEY);
  return raw === "90" ? 90 : raw === "270" ? 270 : 0;
}

export function writeRotation(rotation: Rotation): void {
  writeLocal(KEY, String(rotation));
}
