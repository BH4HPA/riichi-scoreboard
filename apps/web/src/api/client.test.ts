import { afterEach, describe, expect, it, vi } from "vitest";

/** API_BASE 是模块级常量，按环境变量重新加载模块。 */
async function load(base: string | undefined) {
  vi.resetModules();
  if (base === undefined) vi.stubEnv("VITE_API_BASE_URL", "");
  else vi.stubEnv("VITE_API_BASE_URL", base);
  return import("./client");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("拆分托管：前端在 COS、接口在另一域名", () => {
  it("WebSocket 地址跟随 API 基址并切到 wss，尾斜杠被去掉", async () => {
    const { wsUrl, API_BASE } = await load("https://riichi-api.example.com/");
    expect(API_BASE).toBe("https://riichi-api.example.com");
    expect(wsUrl("ABC234", "tok")).toBe("wss://riichi-api.example.com/ws?room=ABC234&token=tok");
  });

  it("相对资源地址补上 API 基址，绝对地址原样透传", async () => {
    const { assetUrl } = await load("https://riichi-api.example.com");
    expect(assetUrl("/api/objects/a.jpg")).toBe("https://riichi-api.example.com/api/objects/a.jpg");
    expect(assetUrl("https://static.example.com/riichi/a.jpg")).toBe(
      "https://static.example.com/riichi/a.jpg",
    );
    expect(assetUrl(null)).toBeNull();
  });

  it("同源部署：基址为空时 WebSocket 用页面 origin", async () => {
    vi.stubGlobal("window", { location: { origin: "http://10.0.0.1:8787" } });
    const { wsUrl, assetUrl } = await load(undefined);
    expect(wsUrl("ABC234", "tok")).toBe("ws://10.0.0.1:8787/ws?room=ABC234&token=tok");
    expect(assetUrl("/api/objects/a.jpg")).toBe("/api/objects/a.jpg");
  });
});
