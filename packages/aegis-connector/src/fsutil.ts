import { open, rename } from "node:fs/promises";
import { dirname } from "node:path";

/** fsync a directory so a rename/create is durable. No-op where unsupported (Windows). */
export async function fsyncDir(dir: string): Promise<void> {
  try {
    const handle = await open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    /* directories cannot be opened/synced on every platform */
  }
}

/** Write a file atomically: temp file + fsync + rename + fsync(dir). */
export async function atomicWriteFile(
  path: string,
  data: string | Uint8Array,
  mode = 0o600,
): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  const handle = await open(tmp, "w", mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
  await fsyncDir(dirname(path));
}

/** Append a line to a file and fsync before returning. */
export async function appendLineDurable(path: string, line: string): Promise<void> {
  const handle = await open(path, "a", 0o600);
  try {
    await handle.writeFile(line.endsWith("\n") ? line : `${line}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
