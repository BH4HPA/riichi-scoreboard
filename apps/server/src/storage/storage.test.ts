import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CosStore, type CosClient } from "./cos";
import { isPrivateKey } from "./index";
import { LocalStore } from "./local";

describe("LocalStore", () => {
  it("写入到根目录下的 key 路径，URL 走 /api/objects；拒绝路径穿越", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "riichi-store-"));
    const store = new LocalStore(root);
    const url = await store.put("avatars/p1/a.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(url).toBe("/api/objects/avatars/p1/a.jpg");
    expect(fs.readFileSync(path.join(root, "avatars/p1/a.jpg"))).toEqual(Buffer.from([1, 2, 3]));
    await store.remove("avatars/p1/a.jpg");
    expect(fs.existsSync(path.join(root, "avatars/p1/a.jpg"))).toBe(false);
    expect(() => store.resolve("../etc/passwd")).toThrow(/非法/);
    expect(() => store.resolve("avatars/../../x")).toThrow(/非法/);
    expect(() => store.resolve("/abs")).toThrow(/非法/);
  });
});

describe("isPrivateKey", () => {
  it("识别照片（定格照、采样帧）私有，头像公开", () => {
    expect(isPrivateKey("hands/p1/a.jpg")).toBe(true);
    expect(isPrivateKey("samples/p1/a.jpg")).toBe(true);
    expect(isPrivateKey("avatars/p1/a.jpg")).toBe(false);
    // 只认前缀，不认中间段
    expect(isPrivateKey("avatars/hands/a.jpg")).toBe(false);
  });
});

describe("CosStore", () => {
  it("key 加前缀上传，URL 为 CDN 域名 + 前缀 + key，Cache-Control 一年", async () => {
    const calls: unknown[] = [];
    const fake: CosClient = {
      putObject: (p) => {
        calls.push(["put", p]);
        return Promise.resolve({});
      },
      deleteObject: (p) => {
        calls.push(["del", p]);
        return Promise.resolve({});
      },
    };
    const store = new CosStore(
      {
        secretId: "id",
        secretKey: "key",
        bucket: "example-static-123",
        region: "ap-shanghai",
        endpoint: null,
        cdnDomain: "https://static.example.com/",
        keyPrefix: "riichi", // 无尾斜杠也归一化为 riichi/
      },
      fake,
    );
    const url = await store.put("avatars/p1/a.jpg", new Uint8Array([9]), "image/jpeg");
    expect(url).toBe("https://static.example.com/riichi/avatars/p1/a.jpg");
    await store.remove("avatars/p1/a.jpg");
    expect(calls).toEqual([
      [
        "put",
        {
          Bucket: "example-static-123",
          Region: "ap-shanghai",
          Key: "riichi/avatars/p1/a.jpg",
          Body: Buffer.from([9]),
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        },
      ],
      [
        "del",
        { Bucket: "example-static-123", Region: "ap-shanghai", Key: "riichi/avatars/p1/a.jpg" },
      ],
    ]);
  });

  it("识别照片以私有 ACL 上传，缓存头也不许共享缓存；头像不带 ACL（继承桶的公有读）", async () => {
    const puts: Parameters<CosClient["putObject"]>[0][] = [];
    const fake: CosClient = {
      putObject: (p) => {
        puts.push(p);
        return Promise.resolve({});
      },
      deleteObject: () => Promise.resolve({}),
    };
    const store = new CosStore(
      {
        secretId: "id",
        secretKey: "key",
        bucket: "b",
        region: "r",
        endpoint: null,
        cdnDomain: "https://static.example.com",
        keyPrefix: "",
      },
      fake,
    );
    await store.put("hands/p1/a.jpg", new Uint8Array([1]), "image/jpeg");
    await store.put("samples/p1/b.jpg", new Uint8Array([1]), "image/jpeg");
    await store.put("avatars/p1/c.jpg", new Uint8Array([1]), "image/jpeg");
    expect(puts.map((p) => [p.Key, p.ACL, p.CacheControl.split(",")[0]])).toEqual([
      ["hands/p1/a.jpg", "private", "private"],
      ["samples/p1/b.jpg", "private", "private"],
      ["avatars/p1/c.jpg", undefined, "public"],
    ]);
    expect(puts[2]).not.toHaveProperty("ACL");
  });
});
