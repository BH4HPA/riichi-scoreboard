import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CosStore, type CosClient } from "./cos";
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
        bucket: "bitego-static-123",
        region: "ap-shanghai",
        endpoint: null,
        cdnDomain: "https://static.example.com/",
        keyPrefix: "riichi/",
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
          Bucket: "bitego-static-123",
          Region: "ap-shanghai",
          Key: "riichi/avatars/p1/a.jpg",
          Body: Buffer.from([9]),
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        },
      ],
      [
        "del",
        { Bucket: "bitego-static-123", Region: "ap-shanghai", Key: "riichi/avatars/p1/a.jpg" },
      ],
    ]);
  });
});
