import { join } from "node:path";

import { LocalBlobStore } from "./local";
import { S3BlobStore } from "./s3";
import type { BlobStore } from "./types";

export type BlobStoreKind = "local" | "s3" | "none";

export interface BlobStoreConfig {
  kind: BlobStoreKind;
  localRoot?: string;
  s3?: {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
    forcePathStyle?: boolean;
  };
}

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

export function loadBlobStoreConfig(): BlobStoreConfig {
  const kind = (process.env.AEGIS_BLOB_STORE?.trim() || "none") as BlobStoreKind;
  const localRoot =
    process.env.AEGIS_BLOB_LOCAL_PATH?.trim() || join(process.cwd(), "tmp", "aegis-blobs");

  if (kind === "s3") {
    const endpoint = process.env.AEGIS_S3_ENDPOINT?.trim() ?? "";
    const bucket = process.env.AEGIS_S3_BUCKET?.trim() ?? "";
    const accessKeyId = process.env.AEGIS_S3_ACCESS_KEY?.trim() ?? "";
    const secretAccessKey = process.env.AEGIS_S3_SECRET_KEY?.trim() ?? "";
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "AEGIS_BLOB_STORE=s3 requires AEGIS_S3_ENDPOINT, AEGIS_S3_BUCKET, AEGIS_S3_ACCESS_KEY, AEGIS_S3_SECRET_KEY",
      );
    }
    return {
      kind,
      localRoot,
      s3: {
        endpoint,
        bucket,
        accessKeyId,
        secretAccessKey,
        region: process.env.AEGIS_S3_REGION?.trim() || undefined,
        forcePathStyle: envFlag("AEGIS_S3_FORCE_PATH_STYLE"),
      },
    };
  }

  return { kind, localRoot };
}

export function createBlobStore(config: BlobStoreConfig = loadBlobStoreConfig()): BlobStore | null {
  if (config.kind === "none") {
    return null;
  }
  if (config.kind === "local") {
    return new LocalBlobStore({ rootDir: config.localRoot! });
  }
  if (config.kind === "s3" && config.s3) {
    return new S3BlobStore({
      bucket: config.s3.bucket,
      endpoint: config.s3.endpoint,
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
      region: config.s3.region,
      forcePathStyle: config.s3.forcePathStyle ?? true,
    });
  }
  throw new Error(`unsupported AEGIS_BLOB_STORE: ${config.kind}`);
}
