import { musicUrl } from "./url";

type Listener = (progress: number) => void;
interface Entry {
  promise: Promise<string>;
  /** 0–1；没有 content-length 时一直是 0，完成时为 1 */
  progress: number;
  listeners: Set<Listener>;
}

const cache = new Map<string, Entry>();
const RETRIES = 2;

/**
 * 取曲：整文件 fetch 后转 blob URL 再交给 <audio>（电视播放与手机试听共用）。
 * 不直接 <audio src=url>：浏览器对媒体首次发的是开区间 `Range: bytes=0-`，腾讯云 CDN 的 HTTP/2 对这种
 * 请求偶发 PROTOCOL_ERROR（实测不带 Range 的整文件请求从不失败）。失败重试两次；同一曲会话内只下载一次。
 * onProgress 立即回调一次当前进度，之后随下载推进；完成后不再回调。
 */
export function loadMusic(id: string, onProgress?: Listener): Promise<string> {
  let entry = cache.get(id);
  if (!entry) {
    const created: Entry = { promise: Promise.resolve(""), progress: 0, listeners: new Set() };
    created.promise = fetchBlobUrl(musicUrl(id), (p) => {
      created.progress = p;
      for (const l of created.listeners) l(p);
    })
      .finally(() => created.listeners.clear())
      .catch((err: unknown) => {
        cache.delete(id);
        throw err;
      });
    cache.set(id, created);
    entry = created;
  }
  if (onProgress) {
    onProgress(entry.progress);
    entry.listeners.add(onProgress);
  }
  return entry.promise;
}

async function fetchBlobUrl(url: string, onProgress: Listener): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      onProgress(0);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await readWithProgress(res, onProgress);
      onProgress(1);
      return URL.createObjectURL(blob);
    } catch (err) {
      if (attempt >= RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function readWithProgress(res: Response, onProgress: Listener): Promise<Blob> {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(Math.min(loaded / total, 0.999));
  }
  return new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") ?? "audio/mpeg" });
}
