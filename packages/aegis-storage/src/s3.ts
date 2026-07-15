import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import type { BlobStore } from "./types";

export interface S3BlobStoreOptions {
  bucket: string;
  endpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 / MinIO path-style addressing */
  forcePathStyle?: boolean;
  /** Injectable client (tests). */
  client?: S3Client;
}

export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3BlobStoreOptions) {
    this.bucket = options.bucket;
    if (options.client) {
      this.client = options.client;
      return;
    }
    const config: S3ClientConfig = {
      region: options.region?.trim() || "auto",
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    };
    if (options.endpoint?.trim()) {
      config.endpoint = options.endpoint.trim();
      config.forcePathStyle = options.forcePathStyle ?? true;
    }
    this.client = new S3Client(config);
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) {
        return null;
      }
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") {
        return null;
      }
      throw err;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "NotFound" || name === "NoSuchKey") {
        return false;
      }
      throw err;
    }
  }
}
