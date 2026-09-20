import { useCallback, useEffect, useRef, useState } from "react";
import { readRotation, writeRotation } from "./rotationPref";
import { rotationFromTilt } from "./tilt";
import type { Rotation } from "./upright";

export type RotationSource = "none" | "manual" | "gyro";

/** iOS 13+ 与新版 Chromium 都有；iOS 上必须在用户手势里调，会弹一次系统授权 */
type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** 能不能听陀螺仪：没有这个 API → false；不用授权 → true；要授权 → 问一次（不在手势里问，iOS 会直接拒绝） */
async function askMotion(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const ask = (DeviceOrientationEvent as OrientationCtor).requestPermission;
  if (!ask) return true;
  try {
    return (await ask.call(DeviceOrientationEvent)) === "granted";
  } catch {
    return false;
  }
}

/**
 * 取景界面的方向。两个来源，**谁最后发生听谁的**：
 * - 手动按钮（常驻）：竖 ⇄ 横。对着桌面拍时手机接近水平，陀螺仪给不出判定，必须留这个口子。
 * - 陀螺仪：只在判定**变了**的那一刻切一次，平时不出声，所以不会把手动选的方向抢回去。
 *   iOS 要授权，而且只能在用户手势里申请：打开时先问一次（安卓 / 桌面不弹窗、直接给；iOS 不在手势里，
 *   静默拒绝），点按钮时再问一次（iOS 这才弹窗）——从不横拍的人永远看不到那个系统弹窗。
 * 初值是上次的方向，任何改动都记下来。
 */
export function useRotation(): {
  rotation: Rotation;
  source: RotationSource;
  toggle: () => void;
} {
  const [rotation, setRotation] = useState<Rotation>(readRotation);
  const [source, setSource] = useState<RotationSource>("none");
  /** 陀螺仪上一次的判定；拿不准时沿用它，判定变了才切 */
  const verdictRef = useRef<Rotation>(rotation);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void askMotion().then((ok) => !cancelled && ok && setListening(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback((next: Rotation, from: RotationSource) => {
    setRotation(next);
    setSource(from);
    writeRotation(next);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const next = rotationFromTilt(
        e.beta,
        e.gamma,
        screen.orientation?.angle ?? 0,
        verdictRef.current,
      );
      if (next === verdictRef.current) return;
      verdictRef.current = next;
      apply(next, "gyro");
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [listening, apply]);

  const toggle = useCallback(() => {
    apply(rotation === 0 ? 90 : 0, "manual");
    // 拒绝、或浏览器不给问：静默只用手动
    if (!listening) void askMotion().then((ok) => ok && setListening(true));
  }, [rotation, listening, apply]);

  return { rotation, source, toggle };
}
