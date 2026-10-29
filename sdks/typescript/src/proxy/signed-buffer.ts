import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApsEvent, SignAndIngestOptions, SignOptions } from "../types.js";
import { signAndIngest } from "../ingest.js";

export type FailMode = "fail_closed" | "fail_open_buffer";

function bufferDir(): string {
  return (
    process.env.AEGIS_SIGNED_BUFFER_DIR?.trim() ||
    join(process.cwd(), ".aegis-signed-buffer")
  );
}

/** Persist a signed event locally when Aegis is unreachable (fail-open + buffer). */
export async function enqueueSignedEvent(
  event: ApsEvent,
  signatureB64: string,
): Promise<string> {
  const dir = bufferDir();
  await mkdir(dir, { recursive: true });
  const id = `buf_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const path = join(dir, `${id}.json`);
  await writeFile(
    path,
    JSON.stringify({ buffer_id: id, event, signature_b64: signatureB64 }, null, 2),
    "utf8",
  );
  return id;
}

/** Drain local signed buffer to Aegis ingest when the API is back. */
export async function drainSignedEventBuffer(input: {
  sign: SignOptions;
  ingest: SignAndIngestOptions;
  ingestFn?: typeof signAndIngest;
}): Promise<{ drained: number; remaining: number; errors: string[] }> {
  const dir = bufferDir();
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return { drained: 0, remaining: 0, errors: [] };
  }

  const ingestFn = input.ingestFn ?? signAndIngest;
  let drained = 0;
  const errors: string[] = [];

  for (const file of files) {
    const path = join(dir, file);
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as {
        event: ApsEvent;
      };
      await ingestFn(raw.event, input.sign, input.ingest);
      await unlink(path);
      drained += 1;
    } catch (error) {
      errors.push(
        `${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const remaining = Math.max(0, files.length - drained);
  return { drained, remaining, errors };
}
