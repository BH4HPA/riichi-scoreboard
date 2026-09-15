import { create } from "zustand";
import type { PlayerRef, RulesPreset } from "@riichi/core";
import { api, ApiError } from "./client";

const TOKEN_KEY = "riichi.token";

interface SessionState {
  token: string | null;
  player: PlayerRef | null;
  presets: RulesPreset[];
  /** 确保已注册并加载档案；重复调用共享同一 Promise。 */
  ensure(): Promise<{ token: string; player: PlayerRef }>;
  updateProfile(patch: { name?: string; avatar?: null }): Promise<PlayerRef>;
  uploadAvatar(blob: Blob): Promise<PlayerRef>;
  loadPresets(): Promise<RulesPreset[]>;
  savePreset(name: string, rules: RulesPreset["rules"]): Promise<RulesPreset>;
  deletePreset(id: string): Promise<void>;
}

let pending: Promise<{ token: string; player: PlayerRef }> | null = null;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 私密模式等场景忽略 */
  }
}

export const useSession = create<SessionState>()((set, get) => ({
  token: readToken(),
  player: null,
  presets: [],

  ensure() {
    const { token, player } = get();
    if (token && player) return Promise.resolve({ token, player });
    if (pending) return pending;
    pending = (async () => {
      const existing = readToken();
      if (existing) {
        try {
          const { player } = await api<{ player: PlayerRef }>("/api/me", { token: existing });
          set({ token: existing, player });
          return { token: existing, player };
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 401)) throw err;
        }
      }
      const { token, player } = await api<{ token: string; player: PlayerRef }>(
        "/api/me/register",
        {
          method: "POST",
          // reason 只用于服务端日志：定位"同一部手机为什么换了身份"
          body: { reason: existing ? "rejected" : "no_token" },
        },
      );
      writeToken(token);
      set({ token, player });
      return { token, player };
    })().finally(() => {
      pending = null;
    });
    return pending;
  },

  async updateProfile(patch) {
    const { token } = await get().ensure();
    const { player } = await api<{ player: PlayerRef }>("/api/me", {
      method: "PATCH",
      body: patch,
      token,
    });
    set({ player });
    return player;
  },

  async uploadAvatar(blob) {
    const { token } = await get().ensure();
    const { player } = await api<{ player: PlayerRef }>("/api/me/avatar", {
      method: "POST",
      raw: blob,
      token,
    });
    set({ player });
    return player;
  },

  async loadPresets() {
    const { token } = await get().ensure();
    const { presets } = await api<{ presets: RulesPreset[] }>("/api/me/presets", { token });
    set({ presets });
    return presets;
  },

  async savePreset(name, rules) {
    const { token } = await get().ensure();
    const { preset } = await api<{ preset: RulesPreset }>("/api/me/presets", {
      method: "POST",
      body: { name, rules },
      token,
    });
    set({ presets: [...get().presets, preset] });
    return preset;
  },

  async deletePreset(id) {
    const { token } = await get().ensure();
    await api<void>(`/api/me/presets/${id}`, { method: "DELETE", token });
    set({ presets: get().presets.filter((p) => p.id !== id) });
  },
}));
