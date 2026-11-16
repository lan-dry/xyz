/**
 * Per-request ingest key for the demo HTTP approval runners.
 *
 * The runners call the API's own intake over HTTP. Historically they used the
 * server's AEGIS_INGEST_KEY (one org). To let `demo:rehearse` target a scratch
 * org without touching the presenting org, the scenarios route runs the
 * runners inside this context with the caller's bearer token, so intake lands
 * in the SAME org the caller authenticated as.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<{ ingestKey: string }>();

export function runWithDemoIngestKey<T>(ingestKey: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ingestKey }, fn);
}

/** Context key (caller's token) → AEGIS_INGEST_KEY → AEGIS_INGEST_DEV_KEY. */
export function resolveDemoIngestKey(): string {
  const key =
    storage.getStore()?.ingestKey?.trim() ||
    process.env.AEGIS_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_DEV_KEY?.trim();
  if (!key) {
    throw new Error("AEGIS_INGEST_KEY or AEGIS_INGEST_DEV_KEY required");
  }
  return key;
}
