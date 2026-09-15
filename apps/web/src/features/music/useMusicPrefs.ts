import { useCallback, useState } from "react";
import { readPrefs, writePrefs, type MusicPrefs } from "./prefs";

/** 本地偏好：读一次，每次更新写穿到 localStorage。 */
export function useMusicPrefs(): [MusicPrefs, (next: (prev: MusicPrefs) => MusicPrefs) => void] {
  const [prefs, setPrefs] = useState<MusicPrefs>(readPrefs);
  const update = useCallback((next: (prev: MusicPrefs) => MusicPrefs) => {
    setPrefs((prev) => {
      const value = next(prev);
      writePrefs(value);
      return value;
    });
  }, []);
  return [prefs, update];
}
