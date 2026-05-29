import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function sha256FileHex(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256BufferHex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
