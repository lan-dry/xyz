import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function uploadRoot(): string {
  return process.env.STOA_UPLOAD_DIR?.trim() || path.join(process.cwd(), "data", "stoa-uploads");
}

export async function persistUpload(
  tenantId: string,
  buffer: Buffer,
): Promise<{ storagePath: string; relativePath: string }> {
  const id = randomUUID();
  const dir = path.join(uploadRoot(), tenantId);
  await mkdir(dir, { recursive: true });
  const relativePath = path.join(tenantId, `${id}.bin`);
  const storagePath = path.join(uploadRoot(), relativePath);
  await writeFile(storagePath, buffer);
  return { storagePath, relativePath };
}
