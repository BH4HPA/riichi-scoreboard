import { musicUrl } from "./url";

const cache = new Map<string, Promise<string>>();
const RETRIES = 2;

/**
 * 电视端取曲：整文件 fetch 后转 blob URL 再交给 <audio>。
 * 不直接 <audio src=url>：浏览器对媒体首次发的是开区间 `Range: bytes=0-`，腾讯云 CDN 的 HTTP/2 对这种
 * 请求偶发 PROTOCOL_ERROR（实测不带 Range 的整文件请求从不失败）。失败重试两次；同一曲会话内只下载一次。
 */
export function loadMusic(id: string): Promise<string> {
  let pending = cache.get(id);
  if (!pending) {
    pending = fetchBlobUrl(musicUrl(id)).catch((err: unknown) => {
      cache.delete(id);
      throw err;
    });
    cache.set(id, pending);
  }
  return pending;
}

async function fetchBlobUrl(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return URL.createObjectURL(await res.blob());
    } catch (err) {
      if (attempt >= RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}
