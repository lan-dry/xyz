import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface RetryConfig {
  initial_ms: number;
  max_ms: number;
  factor: number;
  /** 0..1, fraction of the delay randomised (+/-). */
  jitter: number;
}

export interface ConnectorConfig {
  source_id: string;
  key_id: string;
  /** Key file written by `aegis-connector keygen`. */
  private_key_path: string;
  /** Passphrase for an encrypted key file (normally via AEGIS_KEY_PASSPHRASE). */
  private_key_passphrase?: string;
  /** Aegis API base URL, e.g. https://api.example.com */
  aegis_url: string;
  /** Path of the source-event ingest endpoint on aegis_url. */
  ingest_path: string;
  /** Path of the execution confirm endpoint on aegis_url (Stage 3). */
  confirm_path: string;
  /** Ingest bearer key (normally via AEGIS_INGEST_BEARER). */
  ingest_bearer: string;
  state_dir: string;
  listen: { host: string; port: number };
  /** If set, POST /events and POST /execute/confirm require `Authorization: Bearer <token>`. */
  local_auth_token?: string;
  /** How long POST /events waits for delivery before answering 202 queued. */
  sync_wait_ms: number;
  request_timeout_ms: number;
  retry: RetryConfig;
  /**
   * Demo/sandbox connectors only. On the first successful last-seq read, if this
   * tenant is demo or sandbox and local last_seq is behind, adopt the remote value.
   * Omitted or false: production behaviour (a gap stays an ownership conflict).
   */
  demo_seq_catchup?: boolean;
}

export const DEFAULT_INGEST_PATH = "/v1/aegis/source-events";
export const DEFAULT_CONFIRM_PATH = "/v1/aegis/executions/confirm";

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
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new Error(`${what} must be a number >= ${min}`);
  }
  return value;
}

/** Validate a raw config object. Relative paths are resolved against `baseDir`. */
export function parseConfig(raw: unknown, baseDir: string, env: Env = process.env): ConnectorConfig {
  const c = obj(raw, "config");
  const source_id = str(c.source_id, "source_id");
  const key_id = str(c.key_id, "key_id");
  if (!ID_RE.test(source_id)) throw new Error("source_id must match [A-Za-z0-9._:-]{1,128}");
  if (!ID_RE.test(key_id)) throw new Error("key_id must match [A-Za-z0-9._:-]{1,128}");

  const aegis_url = str(c.aegis_url, "aegis_url");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(aegis_url);
  } catch {
    throw new Error("aegis_url must be an absolute URL");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("aegis_url must be http(s)");
  }

  const ingest_bearer = env.AEGIS_INGEST_BEARER ?? (typeof c.ingest_bearer === "string" ? c.ingest_bearer : "");
  if (!ingest_bearer) {
    throw new Error("ingest bearer is required (env AEGIS_INGEST_BEARER or config ingest_bearer)");
  }

  const listen = c.listen === undefined ? {} : obj(c.listen, "listen");
  const retry = c.retry === undefined ? {} : obj(c.retry, "retry");
  const config: ConnectorConfig = {
    source_id,
    key_id,
    private_key_path: resolve(baseDir, str(c.private_key_path, "private_key_path")),
    private_key_passphrase:
      env.AEGIS_KEY_PASSPHRASE ??
      (typeof c.private_key_passphrase === "string" ? c.private_key_passphrase : undefined),
    aegis_url,
    ingest_path: typeof c.ingest_path === "string" ? c.ingest_path : DEFAULT_INGEST_PATH,
    confirm_path:
      typeof c.confirm_path === "string" ? c.confirm_path : DEFAULT_CONFIRM_PATH,
    ingest_bearer,
    state_dir: resolve(baseDir, typeof c.state_dir === "string" ? c.state_dir : ".aegis-connector"),
    listen: {
      host: typeof listen.host === "string" ? listen.host : "127.0.0.1",
      port: num(listen.port, "listen.port", 8787, 0),
    },
    local_auth_token:
      env.AEGIS_CONNECTOR_LOCAL_TOKEN ??
      (typeof c.local_auth_token === "string" ? c.local_auth_token : undefined),
    sync_wait_ms: num(c.sync_wait_ms, "sync_wait_ms", 2000, 0),
    request_timeout_ms: num(c.request_timeout_ms, "request_timeout_ms", 10_000, 1),
    retry: {
      initial_ms: num(retry.initial_ms, "retry.initial_ms", 500, 1),
      max_ms: num(retry.max_ms, "retry.max_ms", 30_000, 1),
      factor: num(retry.factor, "retry.factor", 2, 1),
      jitter: num(retry.jitter, "retry.jitter", 0.2, 0),
    },
    demo_seq_catchup: c.demo_seq_catchup === true,
  };
  if (config.retry.jitter > 1) throw new Error("retry.jitter must be <= 1");
  if (config.retry.max_ms < config.retry.initial_ms) {
    throw new Error("retry.max_ms must be >= retry.initial_ms");
  }
  return config;
}

export function loadConfigFile(path: string, env: Env = process.env): ConnectorConfig {
  const abs = resolve(path);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read config ${abs}: ${(err as Error).message}`);
  }
  return parseConfig(raw, dirname(abs), env);
}

export function ingestUrl(config: Pick<ConnectorConfig, "aegis_url" | "ingest_path">): string {
  return new URL(config.ingest_path, config.aegis_url).toString();
}

export function confirmUrl(
  config: Pick<ConnectorConfig, "aegis_url" | "confirm_path">,
): string {
  return new URL(config.confirm_path, config.aegis_url).toString();
}

/** Last-accepted-seq sync endpoint (used after seq_replay / sequence conflict). */
export function lastSeqUrl(
  config: Pick<ConnectorConfig, "aegis_url" | "source_id">,
): string {
  return new URL(
    `/v1/aegis/sources/${encodeURIComponent(config.source_id)}/last-seq`,
    config.aegis_url,
  ).toString();
}
