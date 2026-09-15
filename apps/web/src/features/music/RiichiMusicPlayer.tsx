import { useCallback, useEffect, useRef, useState } from "react";
import type { MusicState } from "@riichi/core";
import { useRoomStore } from "@/ws/store";
import { musicLabel } from "./label";
import { loadMusic } from "./loader";
import { MusicFloat } from "./MusicFloat";

/**
 * 电视端立直音乐：跟随 room.music 播 / 换 / 停。
 * 为空即整体卸载（停止且不会留下 src="" 的假错误）；`at` 变化即重挂（换曲与同曲重按都从头播）。
 */
export function RiichiMusicPlayer({
  music,
  names,
}: {
  music: MusicState | null;
  names: readonly string[];
}) {
  if (!music) return null;
  return <Playing key={music.at} music={music} label={musicLabel(music, names)} />;
}

function Playing({ music, label }: { music: MusicState; label: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const notify = useRoomStore((s) => s.notify);

  useEffect(() => {
    let active = true;
    loadMusic(music.track).then(
      (url) => active && setSrc(url),
      () => active && notify("error", `立直音乐加载失败：${label}`),
    );
    return () => {
      active = false;
    };
  }, [music.track, label, notify]);

  // 浏览器要求先有一次用户手势才允许出声：被拒时挂全屏遮罩，点击 / 按键（遥控器）后补播
  const play = useCallback(() => {
    const el = audio.current;
    if (!el || !el.src) return;
    el.play().then(
      () => setBlocked(false),
      (err: unknown) => {
        if (err instanceof DOMException && err.name === "NotAllowedError") setBlocked(true);
      },
    );
  }, []);

  useEffect(() => {
    if (src) play();
  }, [src, play]);

  useEffect(() => {
    if (!blocked) return;
    document.addEventListener("keydown", play, { capture: true });
    return () => document.removeEventListener("keydown", play, { capture: true });
  }, [blocked, play]);

  return (
    <>
      <audio
        ref={audio}
        {...(src ? { src } : {})}
        loop
        preload="auto"
        data-testid="riichi-music"
        data-track={music.track}
      />
      <MusicFloat label={label} />
      {blocked && (
        <button
          type="button"
          onClick={play}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/80 text-2xl font-medium text-fg backdrop-blur"
        >
          点击屏幕任意处开启声音
        </button>
      )}
    </>
  );
}
