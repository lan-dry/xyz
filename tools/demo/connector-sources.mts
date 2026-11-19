/**
 * Demo Bank source connectors (Stage 1b).
 *
 * Generates Ed25519 keys under a gitignored data dir, registers public keys with
 * Aegis (console /sources), and writes Connector config files for `pnpm demo:connectors`.
 *
 * Private keys never leave `.data/connectors/` (or AEGIS_CONNECTORS_DIR).
 */
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateKeyPair, keyPairFromSeed } from "@salanor/aegis-sdk";
import {
  createConnector,
  writePrivateKey,
  readPrivateKey,
  type Connector,
  type ConnectorConfig,
} from "@salanor/aegis-connector";
import {
  ConsoleSession,
  HttpError,
  repoRoot,
  type TenantFile,
} from "./demo-tenant-lib.mts";

export type DemoSourceDef = {
  id: string;
  source_id: string;
  key_id: string;
  name: string;
  kind: "application" | "executor" | "collector" | "third_party";
  /** Default listen port for `pnpm demo:connectors`. */
  port: number;
};

/** LOS is required for loan stories; core/pay are registered for multi-system demos. */
export const DEMO_SOURCES: DemoSourceDef[] = [
  {
    id: "los",
    source_id: "src_los",
    key_id: "k_los_2026_01",
    name: "Demo LOS",
    kind: "application",
    port: 8787,
  },
  {
    id: "core",
    source_id: "src_core",
    key_id: "k_core_2026_01",
    name: "Demo Core Banking",
    kind: "executor",
    port: 8788,
  },
  {
    id: "pay",
    source_id: "src_pay",
    key_id: "k_pay_2026_01",
    name: "Demo Payment Gateway",
    kind: "executor",
    port: 8789,
  },
  /**
   * Red Team only — never share seq with src_los. Not started by demo:connectors
   * (no listen port used by bank stories); private key under .data/connectors/.
   */
  {
    id: "los_redteam",
    source_id: "src_los_redteam",
    key_id: "k_los_redteam_2026_01",
    name: "Demo LOS Red Team",
    kind: "application",
    port: 8797,
  },
  /**
   * Credit bureau (third_party) for nested fact envelopes / fact_mismatch demos.
   * Not started by demo:connectors listen loop.
   */
  {
    id: "bureau",
    source_id: "src_bureau",
    key_id: "k_bureau_2026_01",
    name: "Demo Credit Bureau",
    kind: "third_party",
    port: 8798,
  },
];

export type SourceLocalMeta = {
  source_id: string;
  key_id: string;
  name: string;
  kind: string;
  public_key_b64: string;
  created_at: string;
};

export function connectorsRoot(override?: string): string {
  const fromEnv =
    override?.trim() ||
    process.env.AEGIS_CONNECTORS_DIR?.trim() ||
    process.env.BANK_SIMULATOR_CONNECTORS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(repoRoot(), ".data", "connectors");
}

export function sourceDir(root: string, sourceId: string): string {
  return join(root, sourceId);
}

export function privateKeyPath(root: string, sourceId: string): string {
  return join(sourceDir(root, sourceId), "private.key");
}

export function metaPath(root: string, sourceId: string): string {
  return join(sourceDir(root, sourceId), "meta.json");
}

export function configPath(root: string, sourceId: string): string {
  return join(sourceDir(root, sourceId), "aegis-connector.config.json");
}

export function stateDir(root: string, sourceId: string): string {
  return join(sourceDir(root, sourceId), "state");
}

async function writeJson(path: string, value: unknown, mode = 0o600): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await chmod(path, mode).catch(() => undefined);
}

/** Ensure a private key + meta exist on disk; reuse across demo:fresh. */
export async function ensureLocalSourceKey(
  def: DemoSourceDef,
  root = connectorsRoot(),
): Promise<SourceLocalMeta> {
  const dir = sourceDir(root, def.source_id);
  await mkdir(dir, { recursive: true });
  const keyFile = privateKeyPath(root, def.source_id);
  const metaFile = metaPath(root, def.source_id);

  if (existsSync(keyFile) && existsSync(metaFile)) {
    const meta = JSON.parse(await readFile(metaFile, "utf8")) as SourceLocalMeta;
    // Reuse any existing key for this source_id (key_id may have been rotated to *_local).
    if (meta.source_id === def.source_id && meta.public_key_b64) {
      const seed = await readPrivateKey(keyFile);
      const pair = await keyPairFromSeed(seed);
      if (pair.publicKeyB64 === meta.public_key_b64) return meta;
    }
  }

  const pair = await generateKeyPair();
  await writePrivateKey(keyFile, pair.privateKey, { force: true });
  const meta: SourceLocalMeta = {
    source_id: def.source_id,
    key_id: def.key_id,
    name: def.name,
    kind: def.kind,
    public_key_b64: pair.publicKeyB64,
    created_at: new Date().toISOString(),
  };
  await writeJson(metaFile, meta);
  return meta;
}

export async function writeConnectorConfigFile(
  def: DemoSourceDef,
  opts: { apiBase: string; ingestBearer?: string; root?: string },
): Promise<string> {
  const root = opts.root ?? connectorsRoot();
  const meta = await ensureLocalSourceKey(def, root);
  const cfg = {
    source_id: def.source_id,
    key_id: meta.key_id,
    private_key_path: "./private.key",
    aegis_url: opts.apiBase.replace(/\/+$/, ""),
    ingest_path: "/v1/aegis/source-events",
    state_dir: "./state",
    listen: { host: "127.0.0.1", port: def.port },
    sync_wait_ms: 15_000,
    request_timeout_ms: 20_000,
    retry: { initial_ms: 500, max_ms: 30_000, factor: 2, jitter: 0.2 },
    ...(opts.ingestBearer ? { ingest_bearer: opts.ingestBearer } : {}),
  };
  const path = configPath(root, def.source_id);
  await writeJson(path, cfg);
  return path;
}

type SourceSummary = {
  source_id: string;
  keys?: Array<{ key_id: string; public_key_b64: string; status: string }>;
  active_key?: { key_id: string; public_key_b64: string } | null;
};

/** Register (or confirm) the source public key with Aegis. Idempotent across demo:fresh. */
export async function ensureSourceRegistered(
  session: ConsoleSession,
  def: DemoSourceDef,
  meta: SourceLocalMeta,
  root = connectorsRoot(),
): Promise<"created" | "unchanged" | "key_mismatch"> {
  const listed = await session.call<{ sources: SourceSummary[] }>("/sources", {
    method: "GET",
    okStatuses: [200],
  });
  const existing = listed.data.sources.find((s) => s.source_id === def.source_id);
  if (existing) {
    const keys = existing.keys ?? [];
    const match = keys.find(
      (k) =>
        k.public_key_b64 === meta.public_key_b64 &&
        k.status === "active",
    );
    if (match || existing.active_key?.public_key_b64 === meta.public_key_b64) {
      // Keep local meta.key_id aligned with whatever Aegis has active for this pubkey.
      const activeId = match?.key_id ?? existing.active_key?.key_id;
      if (activeId && activeId !== meta.key_id) {
        meta.key_id = activeId;
        await writeJson(metaPath(root, def.source_id), meta);
      }
      return "unchanged";
    }
    // Source exists with a different key — rotate in our local public key.
    // If def.key_id is taken, use a deterministic rotation id.
    // Prefer the key_id already recorded locally; if that id is taken by a
    // different pubkey, mint a unique rotation id.
    let rotateId = meta.key_id || def.key_id;
    const takenByOther = keys.find(
      (k) => k.key_id === rotateId && k.public_key_b64 !== meta.public_key_b64,
    );
    if (takenByOther) {
      rotateId = `${def.key_id}_${Date.now().toString(36)}`;
    }
    try {
      await session.call(`/sources/${encodeURIComponent(def.source_id)}/keys`, {
        method: "POST",
        body: {
          key_id: rotateId,
          public_key_b64: meta.public_key_b64,
          retire_previous: true,
        },
        okStatuses: [200, 201],
      });
      if (rotateId !== meta.key_id) {
        meta.key_id = rotateId;
        await writeJson(metaPath(root, def.source_id), meta);
      }
      return "created";
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) return "key_mismatch";
      throw err;
    }
  }

  try {
    // Always register the key_id stored locally (meta), not the template def.key_id —
    // after a rotation meta.key_id may be k_*_<suffix> while def.key_id stays stable.
    await session.call("/sources", {
      method: "POST",
      body: {
        source_id: def.source_id,
        name: def.name,
        kind: def.kind,
        owner_contact: "demo-ops@salanor.local",
        key_id: meta.key_id,
        public_key_b64: meta.public_key_b64,
      },
      okStatuses: [200, 201],
    });
    return "created";
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      // Race / concurrent provision: re-check.
      return ensureSourceRegistered(session, def, meta, root);
    }
    throw err;
  }
}

/**
 * Provision all demo sources: local private keys + Aegis registry + connector configs.
 * Call after ingest key exists so configs can embed (or omit) the bearer.
 */
export async function ensureDemoConnectorSources(
  session: ConsoleSession,
  file: TenantFile,
  opts: { ingestKey?: string; root?: string; log?: (msg: string) => void } = {},
): Promise<{ root: string; sources: Array<{ def: DemoSourceDef; meta: SourceLocalMeta; status: string }> }> {
  const log = opts.log ?? (() => undefined);
  const root = opts.root ?? connectorsRoot();
  await mkdir(root, { recursive: true });
  const out: Array<{ def: DemoSourceDef; meta: SourceLocalMeta; status: string }> = [];

  for (const def of DEMO_SOURCES) {
    const meta = await ensureLocalSourceKey(def, root);
    const status = await ensureSourceRegistered(session, def, meta, root);
    await writeConnectorConfigFile(
      { ...def, key_id: meta.key_id },
      {
        apiBase: file.api_base,
        ingestBearer: opts.ingestKey,
        root,
      },
    );
    log(
      `${def.source_id}/${meta.key_id}: ${status}; private key → ${privateKeyPath(root, def.source_id)}`,
    );
    out.push({ def, meta, status });
  }

  // Pointer file for bank-simulator / seed-history (no secrets).
  await writeJson(join(root, "README.local.json"), {
    note: "Private keys in this directory are gitignored. Never commit them.",
    root,
    sources: out.map((o) => ({
      source_id: o.def.source_id,
      key_id: o.meta.key_id,
      port: o.def.port,
      public_key_b64: o.meta.public_key_b64,
    })),
  });

  return { root, sources: out };
}

export function connectorConfigFor(
  def: DemoSourceDef,
  opts: { apiBase: string; ingestBearer: string; root?: string; keyId?: string },
): ConnectorConfig {
  const root = opts.root ?? connectorsRoot();
  return {
    source_id: def.source_id,
    key_id: opts.keyId ?? def.key_id,
    private_key_path: privateKeyPath(root, def.source_id),
    aegis_url: opts.apiBase.replace(/\/+$/, ""),
    ingest_path: "/v1/aegis/source-events",
    confirm_path: "/v1/aegis/executions/confirm",
    ingest_bearer: opts.ingestBearer,
    state_dir: stateDir(root, def.source_id),
    listen: { host: "127.0.0.1", port: def.port },
    sync_wait_ms: 15_000,
    request_timeout_ms: 20_000,
    retry: { initial_ms: 400, max_ms: 8_000, factor: 2, jitter: 0.1 },
  };
}

/** Open an in-process Connector for a demo source (caller must close). */
export async function openDemoConnector(
  sourceId: string,
  opts: { apiBase: string; ingestBearer: string; root?: string },
): Promise<{ connector: Connector; def: DemoSourceDef; meta: SourceLocalMeta }> {
  const def = DEMO_SOURCES.find((s) => s.source_id === sourceId || s.id === sourceId);
  if (!def) throw new Error(`Unknown demo source: ${sourceId}`);
  const root = opts.root ?? connectorsRoot();
  const meta = await ensureLocalSourceKey(def, root);
  const connector = await createConnector(
    connectorConfigFor(def, { ...opts, root, keyId: meta.key_id }),
  );
  return { connector, def, meta };
}
