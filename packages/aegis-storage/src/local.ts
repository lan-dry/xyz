import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

import type { BlobStore, BlobStorePutResult } from "./types";

export interface LocalBlobStoreOptions {
  rootDir: string;
}

export class LocalBlobStore implements BlobStore {
  constructor(private readonly options: LocalBlobStoreOptions) {}

  private pathFor(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    const prefix = safe.slice(0, 2);
    return join(this.options.rootDir, prefix, safe);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

export function contentAddressKey(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return createHash("sha256").update(buf).digest("hex");
}

export async function putContentAddressed(
  store: BlobStore,
  data: Buffer | string,
): Promise<BlobStorePutResult> {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const sha256 = contentAddressKey(buf);
  await store.put(sha256, buf);
  return { key: sha256, sha256 };
}
