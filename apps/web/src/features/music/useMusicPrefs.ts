import { useEffect, useState } from "react";
import { readPrefs, writePrefs, type MusicPrefs } from "./prefs";

/** 本地偏好：挂载时读一次，之后每次变化写回 localStorage。 */
export function useMusicPrefs(): [MusicPrefs, (next: (prev: MusicPrefs) => MusicPrefs) => void] {
  const [prefs, setPrefs] = useState<MusicPrefs>(readPrefs);
  useEffect(() => {
    writePrefs(prefs);
  }, [prefs]);
  return [prefs, setPrefs];
}
