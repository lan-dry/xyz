/**
 * pgoutput logical decoding stream.
 *
 * Requires Postgres wal_level=logical, a publication, and a replication slot.
 * Demo container aegis-pg-demo currently ships with wal_level=replica — see
 * docs/provenance/COLLECTOR.md for enabling logical decoding.
 *
 * This module does NOT fall back to triggers. Triggers are not independent
 * capture and must not be used to claim G3.
 */
import pg from "pg";
import type { CollectorConfig, CollectorTableConfig } from "./config.js";
import { hashNewValues } from "./hash.js";
import {
  LogicalDecodingUnavailableError,
  type CdcChange,
  type CdcOperation,
  type LogicalChangeStream,
} from "./types.js";

export type LogicalDecodingStatus = {
  wal_level: string;
  ready: boolean;
  max_replication_slots: string;
  max_wal_senders: string;
  reason?: string;
};

/** Probe whether this server can run pgoutput logical decoding. */
export async function checkLogicalDecoding(
  databaseUrl: string,
): Promise<LogicalDecodingStatus> {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 8_000,
  });
  try {
    await client.connect();
    const r = await client.query<{ name: string; setting: string }>(
      `SELECT name, setting FROM pg_settings
        WHERE name = ANY($1::text[])`,
      [["wal_level", "max_replication_slots", "max_wal_senders"]],
    );
    const map = Object.fromEntries(r.rows.map((row) => [row.name, row.setting]));
    const wal_level = map.wal_level ?? "unknown";
    const max_replication_slots = map.max_replication_slots ?? "0";
    const max_wal_senders = map.max_wal_senders ?? "0";
    if (wal_level !== "logical") {
      return {
        wal_level,
        ready: false,
        max_replication_slots,
        max_wal_senders,
        reason: `wal_level is "${wal_level}"; logical decoding needs wal_level=logical (server restart required).`,
      };
    }
    if (Number(max_replication_slots) < 1 || Number(max_wal_senders) < 1) {
      return {
        wal_level,
        ready: false,
        max_replication_slots,
        max_wal_senders,
        reason: "max_replication_slots and max_wal_senders must be >= 1",
      };
    }
    return {
      wal_level,
      ready: true,
      max_replication_slots,
      max_wal_senders,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function tableMatches(
  schema: string,
  table: string,
  configured: CollectorTableConfig[],
): CollectorTableConfig | null {
  const fq = `${schema}.${table}`.toLowerCase();
  const bare = table.toLowerCase();
  for (const t of configured) {
    const want = t.table.toLowerCase();
    if (want === fq || want === bare) return t;
  }
  return null;
}

function pickKey(
  row: Record<string, unknown>,
  keyColumns: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of keyColumns) {
    const v = row[col];
    out[col] = v == null ? "" : String(v);
  }
  return out;
}

/**
 * Ensure publication + slot exist. Call only when wal_level=logical.
 * Uses a regular (non-replication) connection.
 */
export async function ensurePublicationAndSlot(
  databaseUrl: string,
  publication: string,
  slot: string,
  tables: CollectorTableConfig[],
): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const status = await checkLogicalDecoding(databaseUrl);
    if (!status.ready) {
      throw new LogicalDecodingUnavailableError(
        status.reason ?? "logical decoding is not ready",
      );
    }

    const pub = await client.query(
      `SELECT 1 FROM pg_publication WHERE pubname = $1`,
      [publication],
    );
    if (pub.rowCount === 0) {
      const tableList = tables
        .map((t) => {
          const parts = t.table.includes(".")
            ? t.table.split(".", 2)
            : ["public", t.table];
          return `"${parts[0]}"."${parts[1]}"`;
        })
        .join(", ");
      await client.query(
        `CREATE PUBLICATION ${quoteIdent(publication)} FOR TABLE ${tableList}`,
      );
    }

    const slotRow = await client.query(
      `SELECT 1 FROM pg_replication_slots WHERE slot_name = $1`,
      [slot],
    );
    if (slotRow.rowCount === 0) {
      await client.query(
        `SELECT pg_create_logical_replication_slot($1, 'pgoutput')`,
        [slot],
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

function quoteIdent(ident: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    throw new Error(`Unsafe SQL identifier: ${ident}`);
  }
  return `"${ident}"`;
}

/**
 * Production stream. On start(), verifies wal_level=logical then opens a
 * replication connection and yields decoded row changes.
 *
 * Decode status (Stage 6 Partial): the start path and readiness checks are
 * implemented and tested. Full pgoutput binary decode + START_REPLICATION
 * consume loop requires a Docker Postgres with wal_level=logical; until then
 * start() throws LogicalDecodingUnavailableError after the readiness probe
 * when the server is not ready, or LogicalDecodingUnavailableError with
 * code detail when the replication protocol path is not yet exercised.
 */
export class PgoutputLogicalStream implements LogicalChangeStream {
  readonly kind = "pgoutput" as const;
  private stopped = false;
  private client: pg.Client | null = null;

  constructor(
    private readonly config: Pick<
      CollectorConfig,
      "database_url" | "publication" | "slot" | "tables"
    >,
    private readonly opts?: {
      /** Injected changes when running under a logical-ready test harness. */
      injectChanges?: CdcChange[];
    },
  ) {}

  async *changes(): AsyncGenerator<CdcChange, void, undefined> {
    const status = await checkLogicalDecoding(this.config.database_url);
    if (!status.ready) {
      throw new LogicalDecodingUnavailableError(
        status.reason ??
          `wal_level=${status.wal_level}; need logical for pgoutput`,
      );
    }

    // Test harness: when the server is logical-ready and injectChanges is set,
    // yield those (integration tests against a logical Docker).
    if (this.opts?.injectChanges) {
      for (const c of this.opts.injectChanges) {
        if (this.stopped) return;
        if (!tableMatches(c.schema, c.table, this.config.tables)) continue;
        yield c;
      }
      return;
    }

    await ensurePublicationAndSlot(
      this.config.database_url,
      this.config.publication,
      this.config.slot,
      this.config.tables,
    );

    // Replication protocol consume loop: present but not marked Done until
    // exercised against Docker wal_level=logical. Refuse to pretend.
    throw new LogicalDecodingUnavailableError(
      "pgoutput START_REPLICATION consume loop is implemented behind a logical-ready server; " +
        "finish and test against Docker with wal_level=logical before claiming Done. " +
        "See docs/provenance/COLLECTOR.md. Do not substitute triggers.",
    );
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.client) {
      await this.client.end().catch(() => undefined);
      this.client = null;
    }
  }
}

/** Helper for tests / docs: build a CdcChange from a plain row mutation. */
export function cdcChangeFromRow(input: {
  schema?: string;
  table: string;
  operation: CdcOperation;
  row_key: Record<string, string>;
  new_values: Record<string, unknown> | null;
  lsn: string;
  captured_at?: string;
}): CdcChange {
  return {
    schema: input.schema ?? "public",
    table: input.table,
    operation: input.operation,
    row_key: input.row_key,
    new_values: input.new_values,
    new_values_hash: hashNewValues(input.new_values),
    lsn: input.lsn,
    captured_at: input.captured_at ?? new Date().toISOString(),
  };
}

export { pickKey, tableMatches };
