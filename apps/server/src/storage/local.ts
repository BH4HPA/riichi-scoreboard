import fs from "node:fs";
import path from "node:path";
import { assertObjectKey, type ObjectStore } from "./index";

export const LOCAL_OBJECTS_ROUTE = "/api/objects";

/** 本地磁盘：开发与无 COS 凭证时使用；文件由服务端在 `/api/objects/*` 托管。 */
export class LocalStore implements ObjectStore {
  constructor(private readonly root: string) {}

  put(key: string, bytes: Uint8Array, _contentType: string): Promise<string> {
    const file = this.resolve(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return Promise.resolve(`${LOCAL_OBJECTS_ROUTE}/${key}`);
  }

  remove(key: string): Promise<void> {
    fs.rmSync(this.resolve(key), { force: true });
    return Promise.resolve();
  }

  /** key → 磁盘路径；非法 key 抛错。 */
  resolve(key: string): string {
    assertObjectKey(key);
    return path.join(this.root, key);
  }
}
