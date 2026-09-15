/** 下载进度：已收字节数与总字节数（未知总数时 total 为 0）。 */
export type ProgressListener = (loaded: number, total: number) => void;

/**
 * 整文件 fetch 并按 content-length 汇报进度。曲库与模型都走这条路：不用 <audio src> / 库内部的 fetch，
 * 一是腾讯云 CDN 的 HTTP/2 对开区间 Range 请求偶发失败，二是大文件（模型 + 运行时约 25 MB）要给用户看进度。
 * 非 2xx 抛 Error("HTTP <status>")。
 */
export async function fetchBytes(
  url: string,
  onProgress?: ProgressListener,
): Promise<{ bytes: Uint8Array; type: string | null }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type");
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !onProgress) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    onProgress?.(bytes.length, bytes.length);
    return { bytes, type };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  onProgress(loaded, loaded);
  return { bytes, type };
}
