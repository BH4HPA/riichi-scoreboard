import COS from "cos-nodejs-sdk-v5";
import { assertObjectKey, type ObjectStore } from "./index";

export interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  /** 自定义端点（如 cos.accelerate.myqcloud.com）；空则用区域默认 */
  endpoint: string | null;
  /** 公开访问域名（CDN），如 https://static.example.com */
  cdnDomain: string;
  /** 桶内前缀（与其它项目共用桶时隔离），如 riichi/ */
  keyPrefix: string;
}

/** 只用到的两个方法，便于测试注入假客户端。 */
export interface CosClient {
  putObject(params: {
    Bucket: string;
    Region: string;
    Key: string;
    Body: Buffer;
    ContentType: string;
    CacheControl: string;
  }): Promise<unknown>;
  deleteObject(params: { Bucket: string; Region: string; Key: string }): Promise<unknown>;
}

export function createCosClient(config: CosConfig): CosClient {
  return new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
    ...(config.endpoint ? { Domain: `{Bucket}.${config.endpoint}` } : {}),
  }) as unknown as CosClient;
}

/** 腾讯云 COS：服务端永久密钥直传，URL 拼 CDN 域名；文件名含随机串，不需刷新 CDN。 */
export class CosStore implements ObjectStore {
  private readonly cdn: string;
  private readonly prefix: string;

  constructor(
    private readonly config: CosConfig,
    private readonly client: CosClient = createCosClient(config),
  ) {
    this.cdn = config.cdnDomain.replace(/\/+$/, "");
    this.prefix = config.keyPrefix.replace(/^\/+/, "");
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    assertObjectKey(key);
    await this.client.putObject({
      Bucket: this.config.bucket,
      Region: this.config.region,
      Key: this.prefix + key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    });
    return `${this.cdn}/${this.prefix}${key}`;
  }

  async remove(key: string): Promise<void> {
    assertObjectKey(key);
    await this.client.deleteObject({
      Bucket: this.config.bucket,
      Region: this.config.region,
      Key: this.prefix + key,
    });
  }
}
