import { createHash, randomUUID } from "node:crypto";
import { hashNewValues, changeFingerprint } from "./hash.js";
import {
  COLLECTOR_EVENT_TYPE,
  type CdcChange,
  type CollectorCdcEvent,
} from "./types.js";

export type CaseIdMapping = {
  /** Postgres schema.table (lowercase compare). */
  table: string;
  /** Column in row_key that holds the case id (e.g. "case_id" or "loan_id"). */
  case_id_column: string;
};

/** Resolve case_id from row_key using the first matching table mapping. */
export function resolveCaseId(
  change: Pick<CdcChange, "schema" | "table" | "row_key">,
  mappings: CaseIdMapping[],
): string | null {
  const fq = `${change.schema}.${change.table}`.toLowerCase();
  const bare = change.table.toLowerCase();
  for (const m of mappings) {
    const want = m.table.toLowerCase();
    if (want !== fq && want !== bare) continue;
    const v = change.row_key[m.case_id_column];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Build the business event the collector signs. Does not include the source
 * envelope — that is added by signAndSend.
 */
export function buildCollectorEvent(
  change: CdcChange,
  mappings: CaseIdMapping[],
  opts?: { idempotency_key?: string; emitted_at?: string },
): CollectorCdcEvent {
  const new_values_hash =
    change.new_values_hash || hashNewValues(change.new_values);
  const fp = changeFingerprint({
    schema: change.schema,
    table: change.table,
    operation: change.operation,
    row_key: change.row_key,
    new_values_hash,
    lsn: change.lsn,
  });
  // Deterministic UUID-shaped id from the fingerprint so retries of the same
  // LSN/row do not mint a new envelope identity.
  const idem =
    opts?.idempotency_key ??
    (() => {
      const hex = createHash("sha256").update(fp).digest("hex");
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        "4" + hex.slice(13, 16),
        ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
          .toString(16)
          .padStart(2, "0") + hex.slice(18, 20),
        hex.slice(20, 32),
      ].join("-");
    })();

  return {
    schema_version: 1,
    event_type: COLLECTOR_EVENT_TYPE,
    case_id: resolveCaseId(change, mappings),
    idempotency_key: idem,
    emitted_at: opts?.emitted_at ?? change.captured_at,
    attributes: {
      cdc: {
        schema: change.schema,
        table: change.table,
        operation: change.operation,
        row_key: change.row_key,
        new_values_hash,
        lsn: change.lsn,
      },
    },
  };
}

/** Fresh random UUID when a caller wants a one-off event (tests). */
export function newIdempotencyKey(): string {
  return randomUUID();
}
