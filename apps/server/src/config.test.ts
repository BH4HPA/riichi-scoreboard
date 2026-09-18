import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("COS 变量全空走本地；全填启用；只填一部分报错并点名缺项", () => {
    expect(loadConfig({}).cos).toBeNull();
    const full = loadConfig({
      QCLOUD_SECRET_ID: "id",
      QCLOUD_SECRET_KEY: "key",
      QCLOUD_COS_BUCKET: "b",
      QCLOUD_COS_REGION: "ap-shanghai",
      QCLOUD_COS_CDN_DOMAIN: "https://cdn.example.com",
    });
    expect(full.cos).toMatchObject({ bucket: "b", endpoint: null, keyPrefix: "riichi/" });
    expect(() => loadConfig({ QCLOUD_SECRET_ID: "id" })).toThrow(/QCLOUD_SECRET_KEY/);
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
  });

  it("TRUST_PROXY 只认 1/true", () => {
    expect(loadConfig({}).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: "1" }).trustProxy).toBe(true);
    expect(loadConfig({ TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(loadConfig({ TRUST_PROXY: "yes" }).trustProxy).toBe(false);
  });
});
