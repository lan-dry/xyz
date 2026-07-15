import { signEvent } from "./canonical.js";
import type { ApsEvent, SignAndIngestOptions, SignOptions } from "./types.js";

export type IngestResult = {
  event_id: string;
  status: "created" | "replayed";
  sequence_num?: number;
  event_hash?: string;
};

export async function signAndIngest(
  event: ApsEvent,
  signOptions: SignOptions,
  ingestOptions: SignAndIngestOptions,
): Promise<IngestResult> {
  const signed = await signEvent(event, signOptions);
  const url = new URL("/v1/aegis/events", ingestOptions.apiBaseUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ingestOptions.ingestApiKey}`,
    "Content-Type": "application/json",
    "Salanor-Version": "2026-05-18",
  };
  if (ingestOptions.idempotencyKey) {
    headers["Idempotency-Key"] = ingestOptions.idempotencyKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(signed),
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Aegis API at ${ingestOptions.apiBaseUrl} (${msg}). Is the stack running? Try: pnpm dev`,
    );
  });

  const body = (await response.json().catch(() => ({}))) as IngestResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      `Ingest failed (${response.status}): ${body.error ?? JSON.stringify(body)}`,
    );
  }

  return body;
}
