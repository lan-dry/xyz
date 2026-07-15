import type { ApsEvent } from "@salanor/aegis-ledger-sdk";

/** Wire format published to JetStream (`aegis.events.ingest`). */
export interface IngestEnvelope {
  schema_version: "1";
  trace_id: string;
  organization_id?: string;
  event: ApsEvent;
  idempotency_key?: string;
  published_at: string;
}

export function parseIngestEnvelope(raw: Uint8Array | string): IngestEnvelope {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("envelope_not_object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.schema_version !== "1") {
    throw new Error("envelope_bad_schema_version");
  }
  if (typeof record.trace_id !== "string" || !record.event || typeof record.event !== "object") {
    throw new Error("envelope_missing_fields");
  }
  return parsed as IngestEnvelope;
}

export function encodeIngestEnvelope(envelope: IngestEnvelope): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(envelope));
}
