/**
 * pgoutput logical decoding stream via maintained `pg-logical-replication`.
 *
 * Requires Postgres wal_level=logical, a publication, and a replication slot.
 * Uses a dedicated REPLICATION role — never the application role.
 * Does NOT fall back to triggers (triggers are not independent capture / G3).
 */
import pg from "pg";
import {
  LogicalReplicationService,
  PgoutputPlugin,
  type Pgoutput,
} from "pg-logical-replication";
import type { CollectorConfig, CollectorTableConfig } from "./config.js";
import { hashNewValues, matchValuesFromRow } from "./hash.js";
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

function quoteIdent(ident: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    throw new Error(`Unsafe SQL identifier: ${ident}`);
  }
  return `"${ident}"`;
}

/**
 * Ensure publication + slot exist. Call only when wal_level=logical.
 * Uses a regular (non-replication) connection — typically the collector role
 * with CREATE privileges, or a bootstrap superuser during demo init.
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

/** Parse a postgres URL into node-postgres ClientConfig. */
export function clientConfigFromUrl(databaseUrl: string): pg.ClientConfig {
  const u = new URL(databaseUrl);
  return {
    host: u.hostname || "127.0.0.1",
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    ssl: u.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : undefined,
  };
}

function rowToStrings(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return { ...row };
}

function changeFromMessage(
  lsn: string,
  log: Pgoutput.Message,
  tables: CollectorTableConfig[],
  capturedAt: string,
): CdcChange | null {
  if (log.tag !== "insert" && log.tag !== "update" && log.tag !== "delete") {
    return null;
  }
  const schema = log.relation.schema;
  const table = log.relation.name;
  const cfg = tableMatches(schema, table, tables);
  if (!cfg) return null;
  if (cfg.operations && !cfg.operations.includes(log.tag as CdcOperation)) {
    return null;
  }

  const newRow =
    log.tag === "delete"
      ? null
      : rowToStrings((log as Pgoutput.MessageInsert | Pgoutput.MessageUpdate).new);
  const keySource =
    log.tag === "insert"
      ? (log as Pgoutput.MessageInsert).new
      : (log as Pgoutput.MessageUpdate | Pgoutput.MessageDelete).key ??
        (log as Pgoutput.MessageUpdate | Pgoutput.MessageDelete).old ??
        (log.tag === "update" ? (log as Pgoutput.MessageUpdate).new : null);

  if (!keySource && log.tag !== "insert") {
    return null;
  }
  const row_key = pickKey(
    (keySource ?? {}) as Record<string, unknown>,
    cfg.key_columns,
  );

  const match = matchValuesFromRow(newRow);
  const new_values = match ?? newRow;

  return {
    schema,
    table,
    operation: log.tag as CdcOperation,
    row_key,
    new_values,
    new_values_hash: hashNewValues(new_values),
    lsn,
    captured_at: capturedAt,
  };
}

type QueuedChange = {
  change: CdcChange;
  /** LSN to acknowledge after the consumer has processed this change. */
  ackLsn: string;
};

/**
 * Production stream: START_REPLICATION via pgoutput, decode INSERT/UPDATE/DELETE
 * with LSN, resume from the replication slot (ack only after consumer success).
 * Reconnects on drop without advancing past unacked LSNs (no loss); ingest
 * idempotency_key prevents duplicates on redelivery.
 */
export class PgoutputLogicalStream implements LogicalChangeStream {
  readonly kind = "pgoutput" as const;
  private stopped = false;
  private service: LogicalReplicationService | null = null;
  private readonly reconnectMs: number;

  constructor(
    private readonly config: Pick<
      CollectorConfig,
      "database_url" | "publication" | "slot" | "tables"
    >,
    private readonly opts?: {
      /** Injected changes when running under a logical-ready test harness. */
      injectChanges?: CdcChange[];
      /** Delay between reconnect attempts (default 2000). */
      reconnect_ms?: number;
    },
  ) {
    this.reconnectMs = opts?.reconnect_ms ?? 2_000;
  }

  async *changes(): AsyncGenerator<CdcChange, void, undefined> {
    const status = await checkLogicalDecoding(this.config.database_url);
    if (!status.ready) {
      throw new LogicalDecodingUnavailableError(
        status.reason ??
          `wal_level=${status.wal_level}; need logical for pgoutput`,
      );
    }

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

    while (!this.stopped) {
      try {
        yield* this.session();
      } catch (err) {
        if (this.stopped) return;
        console.error(
          JSON.stringify({
            msg: "aegis-collector-pg replication session ended",
            error: err instanceof Error ? err.message : String(err),
            reconnect_ms: this.reconnectMs,
          }),
        );
        await sleep(this.reconnectMs);
      }
    }
  }

  private async *session(): AsyncGenerator<CdcChange, void, undefined> {
    const clientConfig = clientConfigFromUrl(this.config.database_url);
    const service = new LogicalReplicationService(clientConfig, {
      acknowledge: { auto: false, timeoutSeconds: 10 },
      flowControl: { enabled: true },
    });
    this.service = service;

    const queue: QueuedChange[] = [];
    let wake: (() => void) | null = null;
    let sessionError: Error | null = null;
    let ended = false;
    /** Last commitEndLsn seen — used to ack after the consumer drains the txn. */
    let pendingCommitAck: string | null = null;
    const pendingInTxn: QueuedChange[] = [];

    const signal = () => {
      const w = wake;
      wake = null;
      w?.();
    };

    service.on("error", (err: Error) => {
      sessionError = err;
      ended = true;
      signal();
    });

    service.on("data", async (lsn: string, log: Pgoutput.Message) => {
      if (this.stopped) return;
      if (log.tag === "begin") {
        pendingInTxn.length = 0;
        return;
      }
      if (log.tag === "commit") {
        const ack =
          log.commitEndLsn ?? log.commitLsn ?? lsn;
        for (const item of pendingInTxn) {
          queue.push({ ...item, ackLsn: ack });
        }
        pendingInTxn.length = 0;
        pendingCommitAck = ack;
        // If the txn had no watched row changes, still advance the slot.
        if (queue.length === 0 && ack) {
          await service.acknowledge(ack).catch(() => undefined);
          pendingCommitAck = null;
        }
        signal();
        return;
      }

      const change = changeFromMessage(
        lsn,
        log,
        this.config.tables,
        new Date().toISOString(),
      );
      if (!change) return;
      pendingInTxn.push({ change, ackLsn: lsn });
    });

    const plugin = new PgoutputPlugin({
      protoVersion: 1,
      publicationNames: [this.config.publication],
    });

    const subscribePromise = service
      .subscribe(plugin, this.config.slot)
      .then(() => {
        ended = true;
        signal();
      })
      .catch((err: unknown) => {
        sessionError =
          err instanceof Error ? err : new Error(String(err));
        ended = true;
        signal();
      });

    let lastAck: string | null = null;
    try {
      while (!this.stopped) {
        while (queue.length === 0 && !ended && !sessionError) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
        if (sessionError) throw sessionError;
        if (queue.length === 0 && ended) break;

        const item = queue.shift()!;
        // After the consumer finishes with the previous change, ack it.
        if (lastAck && lastAck !== item.ackLsn) {
          await service.acknowledge(lastAck);
          if (pendingCommitAck === lastAck) pendingCommitAck = null;
        }
        yield item.change;
        lastAck = item.ackLsn;
      }
      if (lastAck) {
        await service.acknowledge(lastAck);
        pendingCommitAck = null;
      } else if (pendingCommitAck) {
        await service.acknowledge(pendingCommitAck);
      }
    } finally {
      await service.stop().catch(() => undefined);
      this.service = null;
      await subscribePromise.catch(() => undefined);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.service) {
      await this.service.stop().catch(() => undefined);
      this.service = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const match = matchValuesFromRow(input.new_values);
  const new_values = match ?? input.new_values;
  return {
    schema: input.schema ?? "public",
    table: input.table,
    operation: input.operation,
    row_key: input.row_key,
    new_values,
    new_values_hash: hashNewValues(new_values),
    lsn: input.lsn,
    captured_at: input.captured_at ?? new Date().toISOString(),
  };
}

export { pickKey, tableMatches };
