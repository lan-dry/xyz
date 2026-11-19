/**
 * Independent capture (Stage 6): a CDC change observed outside the application
 * path. The collector signs these with its own source key (src_core_cdc).
 */

export const COLLECTOR_EVENT_TYPE = "cdc.row_change" as const;
export const DEFAULT_COLLECTOR_SOURCE_ID = "src_core_cdc" as const;

export type CdcOperation = "insert" | "update" | "delete" | "truncate";

/** One row-level change from logical decoding (or a test simulation). */
export type CdcChange = {
  schema: string;
  table: string;
  operation: CdcOperation;
  /** Primary / business key columns as strings. */
  row_key: Record<string, string>;
  /** New tuple values (null on delete / truncate). */
  new_values: Record<string, unknown> | null;
  /** sha256 hex of JCS(new_values); empty string when new_values is null. */
  new_values_hash: string;
  /** Postgres LSN, e.g. "0/16B3748". */
  lsn: string;
  /** ISO-8601 UTC when the collector observed the change. */
  captured_at: string;
};

/** Business event inside an AEGIS-SRC1 envelope from the collector. */
export type CollectorCdcEvent = {
  schema_version: 1;
  event_type: typeof COLLECTOR_EVENT_TYPE;
  /** Mapped from row_key via config; null when the table has no case mapping. */
  case_id: string | null;
  idempotency_key: string;
  emitted_at: string;
  attributes: {
    cdc: {
      schema: string;
      table: string;
      operation: CdcOperation;
      row_key: Record<string, string>;
      new_values_hash: string;
      lsn: string;
    };
  };
};

/**
 * Pluggable change source. Production uses pgoutput logical decoding.
 * Tests inject a SimulatedChangeStream. Triggers are deliberately NOT a
 * production stream kind — they are not independent capture (G3).
 */
export type LogicalChangeStream = {
  readonly kind: "pgoutput" | "simulated";
  /** Yield changes until stop() or the upstream ends. */
  changes(): AsyncGenerator<CdcChange, void, undefined>;
  stop(): Promise<void>;
};

export class LogicalDecodingUnavailableError extends Error {
  readonly code = "logical_decoding_unavailable" as const;
  constructor(message: string) {
    super(message);
    this.name = "LogicalDecodingUnavailableError";
  }
}
