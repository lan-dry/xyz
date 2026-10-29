import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function uploadRoot(): string {
  return process.env.STOA_UPLOAD_DIR?.trim() || path.join(process.cwd(), "data", "stoa-uploads");
}

export async function persistUpload(
  tenantId: string,
  buffer: Buffer,
  ext = "bin",
): Promise<{ storagePath: string; relativePath: string; id: string }> {
  const id = randomUUID();
  const dir = path.join(uploadRoot(), tenantId);
  await mkdir(dir, { recursive: true });
  const relativePath = path.join(tenantId, `${id}.${ext}`);
  const storagePath = path.join(uploadRoot(), relativePath);
  await writeFile(storagePath, buffer);
  return { storagePath, relativePath, id };
}

export async function persistRedactedPng(
  tenantId: string,
  originalId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(uploadRoot(), tenantId);
  await mkdir(dir, { recursive: true });
  const relativePath = path.join(tenantId, `${originalId}.redacted.png`);
  await writeFile(path.join(uploadRoot(), relativePath), buffer);
  return relativePath;
}
