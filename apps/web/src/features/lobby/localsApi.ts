import type { LocalPlayerView } from "@riichi/core";
import { api } from "@/api/client";

/** 主控台的本地玩家档案（服务端 DTO 整体透传）。 */
export const localsApi = {
  list: (token: string) =>
    api<{ locals: LocalPlayerView[] }>("/api/me/locals", { token }).then((r) => r.locals),
  create: (token: string, name: string) =>
    api<{ local: LocalPlayerView }>("/api/me/locals", {
      method: "POST",
      body: { name },
      token,
    }).then((r) => r.local),
  rename: (token: string, id: string, name: string) =>
    api<{ local: LocalPlayerView }>(`/api/me/locals/${id}`, {
      method: "PATCH",
      body: { name },
      token,
    }).then((r) => r.local),
  uploadAvatar: (token: string, id: string, blob: Blob) =>
    api<{ local: LocalPlayerView }>(`/api/me/locals/${id}/avatar`, {
      method: "POST",
      raw: blob,
      token,
    }).then((r) => r.local),
  remove: (token: string, id: string) =>
    api<void>(`/api/me/locals/${id}`, { method: "DELETE", token }),
};
