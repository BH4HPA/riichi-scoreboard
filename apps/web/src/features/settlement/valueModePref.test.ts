import { afterEach, describe, expect, it, vi } from "vitest";
import { readValueMode, writeValueMode } from "./valueModePref";

describe("valueModePref", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("写入后读回；只认 hand，其余一律番符", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    expect(readValueMode()).toBe("manual");
    writeValueMode("hand");
    expect(readValueMode()).toBe("hand");
    writeValueMode("manual");
    expect(readValueMode()).toBe("manual");
    store.set("riichi.settlement.valueMode", "garbage");
    expect(readValueMode()).toBe("manual");
  });

  it("无 localStorage / 读写抛错 → 番符，不抛", () => {
    expect(readValueMode()).toBe("manual");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readValueMode()).toBe("manual");
    expect(() => writeValueMode("hand")).not.toThrow();
  });
});
