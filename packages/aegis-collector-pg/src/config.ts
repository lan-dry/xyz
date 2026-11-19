import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_COLLECTOR_SOURCE_ID,
  type CdcOperation,
} from "./types.js";
import type { CaseIdMapping } from "./event.js";

export type CollectorTableConfig = {
  /** schema.table or bare table name. */
  table: string;
  /** Columns that form the row key (required for insert/update/delete). */
  key_columns: string[];
  operations?: CdcOperation[];
};

export type CollectorConfig = {
  /** Registered collector source id (default src_core_cdc). */
  source_id: string;
  key_id: string;
  private_key_path: string;
  private_key_passphrase?: string;
  /** Replication / read credential — must NOT be the app role. */
  database_url: string;
  publication: string;
  slot: string;
  tables: CollectorTableConfig[];
  case_id_mappings: CaseIdMapping[];
  aegis_url: string;
  /** Collector-event ingest path on aegis_url. */
  ingest_path: string;
  ingest_bearer: string;
  state_dir: string;
  request_timeout_ms: number;
  /** How often to poll when using the simulated stream only. */
  poll_ms: number;
};

export const DEFAULT_COLLECTOR_INGEST_PATH = "/v1/aegis/collector-events";

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

type Env = Record<string, string | undefined>;

function obj(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${what} is required (non-empty string)`);
  }
  return value;
}

function num(value: unknown, what: string, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new Error(`${what} must be a number >= ${min}`);
  }
  return value;
}

export function parseConfig(
  raw: unknown,
  baseDir: string,
  env: Env = process.env,
): CollectorConfig {
  const c = obj(raw, "config");
  const source_id =
    typeof c.source_id === "string" && c.source_id
      ? c.source_id
      : DEFAULT_COLLECTOR_SOURCE_ID;
  const key_id = str(c.key_id, "key_id");
  if (!ID_RE.test(source_id)) throw new Error("source_id must match [A-Za-z0-9._:-]{1,128}");
  if (!ID_RE.test(key_id)) throw new Error("key_id must match [A-Za-z0-9._:-]{1,128}");

  const database_url =
    env.AEGIS_COLLECTOR_DATABASE_URL ??
    (typeof c.database_url === "string" ? c.database_url : "");
  if (!database_url) {
    throw new Error(
      "database_url is required (env AEGIS_COLLECTOR_DATABASE_URL or config database_url). Use a dedicated replication role, not the app credential.",
    );
  }

  const aegis_url = str(c.aegis_url, "aegis_url");
  try {
    // eslint-disable-next-line no-new
    new URL(aegis_url);
  } catch {
    throw new Error("aegis_url must be an absolute URL");
  }

  const ingest_bearer =
    env.AEGIS_INGEST_BEARER ??
    (typeof c.ingest_bearer === "string" ? c.ingest_bearer : "");
  if (!ingest_bearer) {
    throw new Error(
      "ingest bearer is required (env AEGIS_INGEST_BEARER or config ingest_bearer)",
    );
  }

  const tablesRaw = Array.isArray(c.tables) ? c.tables : [];
  if (tablesRaw.length === 0) throw new Error("tables must be a non-empty array");
  const tables: CollectorTableConfig[] = tablesRaw.map((t, i) => {
    const row = obj(t, `tables[${i}]`);
    const table = str(row.table, `tables[${i}].table`);
    const key_columns = Array.isArray(row.key_columns)
      ? row.key_columns.map((k, j) => str(k, `tables[${i}].key_columns[${j}]`))
      : [];
    if (key_columns.length === 0) {
      throw new Error(`tables[${i}].key_columns is required`);
    }
    return {
      table,
      key_columns,
      operations: Array.isArray(row.operations)
        ? (row.operations as CdcOperation[])
        : undefined,
    };
  });

  const mappingsRaw = Array.isArray(c.case_id_mappings) ? c.case_id_mappings : [];
  const case_id_mappings: CaseIdMapping[] = mappingsRaw.map((m, i) => {
    const row = obj(m, `case_id_mappings[${i}]`);
    return {
      table: str(row.table, `case_id_mappings[${i}].table`),
      case_id_column: str(
        row.case_id_column,
        `case_id_mappings[${i}].case_id_column`,
      ),
    };
  });

  return {
    source_id,
    key_id,
    private_key_path: resolve(baseDir, str(c.private_key_path, "private_key_path")),
    private_key_passphrase:
      env.AEGIS_KEY_PASSPHRASE ??
      (typeof c.private_key_passphrase === "string"
        ? c.private_key_passphrase
        : undefined),
    database_url,
    publication:
      typeof c.publication === "string" && c.publication
        ? c.publication
        : "aegis_collector",
    slot:
      typeof c.slot === "string" && c.slot ? c.slot : "aegis_collector_slot",
    tables,
    case_id_mappings,
    aegis_url,
    ingest_path:
      typeof c.ingest_path === "string" ? c.ingest_path : DEFAULT_COLLECTOR_INGEST_PATH,
    ingest_bearer,
    state_dir: resolve(
      baseDir,
      typeof c.state_dir === "string" ? c.state_dir : ".aegis-collector-pg",
    ),
    request_timeout_ms: num(c.request_timeout_ms, "request_timeout_ms", 10_000, 1),
    poll_ms: num(c.poll_ms, "poll_ms", 500, 50),
  };
}

export function loadConfigFile(
  path: string,
  env: Env = process.env,
): CollectorConfig {
  const abs = resolve(path);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read config ${abs}: ${(err as Error).message}`);
  }
  return parseConfig(raw, dirname(abs), env);
}

export function ingestUrl(
  config: Pick<CollectorConfig, "aegis_url" | "ingest_path">,
): string {
  return new URL(config.ingest_path, config.aegis_url).toString();
}
