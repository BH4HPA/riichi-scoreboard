export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null; raw?: BodyInit } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let body: BodyInit | undefined = init.raw;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: body ?? null,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok)
    throw new ApiError(
      res.status,
      data.error ?? "http",
      data.message ?? `请求失败（${res.status}）`,
    );
  return data as T;
}

/** WebSocket 地址：与 API 基址同源，http→ws。 */
export function wsUrl(code: string, token: string): string {
  const base = API_BASE || window.location.origin;
  const url = new URL("/ws", base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("room", code);
  url.searchParams.set("token", token);
  return url.toString();
}

/** 头像等相对地址补全为绝对地址（跨域部署时需要）。 */
export function assetUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}
