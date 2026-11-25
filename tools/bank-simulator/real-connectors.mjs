/**
 * In-process Aegis Connectors for Demo Bank systems (Stage 1b).
 *
 * Loads private keys from the provisioned gitignored dir (`.data/connectors/` or
 * AEGIS_CONNECTORS_DIR), creates one `@salanor/aegis-connector` per system, and
 * submits business events as AEGIS-SRC1 envelopes to `/v1/aegis/source-events`.
 *
 * Falls back to generating a local key under BANK_SIMULATOR_DATA_DIR/connectors
 * when the shared provision dir is missing (unit tests / first boot without provision).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEMS } from "./systems.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const SOURCE_PORTS = {
  src_los: 8787,
  src_core: 8788,
  src_pay: 8789,
};

function sharedConnectorsRoot() {
  const fromEnv =
    process.env.AEGIS_CONNECTORS_DIR?.trim() ||
    process.env.BANK_SIMULATOR_CONNECTORS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(repoRoot, ".data", "connectors");
}

async function loadSdk() {
  try {
    return await import("@salanor/aegis-sdk");
  } catch {
    const fallback = resolve(repoRoot, "packages/aegis-sdk/dist/index.js");
    if (existsSync(fallback)) {
      return import(new URL(`file:///${fallback.replace(/\\/g, "/")}`).href);
    }
    throw new Error("@salanor/aegis-sdk is not built (pnpm --filter @salanor/aegis-sdk build)");
  }
}

async function loadConnectorPkg() {
  try {
    return await import("@salanor/aegis-connector");
  } catch {
    const fallback = resolve(repoRoot, "packages/aegis-connector/dist/index.js");
    if (existsSync(fallback)) {
      return import(new URL(`file:///${fallback.replace(/\\/g, "/")}`).href);
    }
    throw new Error(
      "@salanor/aegis-connector is not built (pnpm --filter @salanor/aegis-connector build)",
    );
  }
}

/**
 * @typedef {{
 *   source_id: string,
 *   key_id: string,
 *   public_key_b64: string,
 *   private_key_path: string,
 *   state_dir: string,
 * }} LocalKeyMaterial
 */

export class RealConnectors {
  /**
   * @param {string} dataDir  bank-simulator data dir (for fallback keys + local state mirror)
   * @param {{ apiBase?: string, ingestKey?: string, localStateOnly?: boolean }} cfg
   *   localStateOnly: keep outbox/seq under dataDir even when the private key is shared
   *   (use for scratch tenants like demo-bank-rehearsal so seq starts fresh per org).
   */
  constructor(dataDir, cfg = {}) {
    this.dataDir = dataDir;
    this.cfg = cfg;
    /** @type {Map<string, import('@salanor/aegis-connector').Connector>} */
    this.connectors = new Map();
    /** @type {Map<string, Promise<import('@salanor/aegis-connector').Connector|null>>} */
    this.opening = new Map();
    /** @type {Map<string, LocalKeyMaterial>} */
    this.keys = new Map();
    this.ready = false;
    this.sharedRoot = sharedConnectorsRoot();
  }

  async init() {
    const sdk = await loadSdk();
    const conn = await loadConnectorPkg();
    await mkdir(join(this.dataDir, "connectors"), { recursive: true });

    for (const sys of SYSTEMS) {
      if (sys.external) continue;
      const material = await this.#ensureKey(sys, sdk, conn);
      this.keys.set(sys.id, material);
    }
    this.ready = true;
  }

  /**
   * @param {typeof SYSTEMS[number]} sys
   * @param {Awaited<ReturnType<typeof loadSdk>>} sdk
   * @param {Awaited<ReturnType<typeof loadConnectorPkg>>} conn
   * @returns {Promise<LocalKeyMaterial>}
   */
  async #ensureKey(sys, sdk, conn) {
    const sharedKey = join(this.sharedRoot, sys.source_id, "private.key");
    const sharedMeta = join(this.sharedRoot, sys.source_id, "meta.json");
    const sharedState = join(this.sharedRoot, sys.source_id, "state");

    if (existsSync(sharedKey) && existsSync(sharedMeta)) {
      const meta = JSON.parse(await readFile(sharedMeta, "utf8"));
      const state_dir = this.cfg.localStateOnly
        ? join(this.dataDir, "connectors", sys.source_id, "state")
        : sharedState;
      if (this.cfg.localStateOnly) {
        await mkdir(dirname(state_dir), { recursive: true });
      }
      return {
        source_id: sys.source_id,
        key_id: meta.key_id || sys.key_id,
        public_key_b64: meta.public_key_b64,
        private_key_path: sharedKey,
        state_dir,
      };
    }

    // Fallback for tests / boot without provision: keys under bank data dir.
    const localDir = join(this.dataDir, "connectors", sys.source_id);
    await mkdir(localDir, { recursive: true });
    const keyPath = join(localDir, "private.key");
    const metaPath = join(localDir, "meta.json");
    if (existsSync(keyPath) && existsSync(metaPath)) {
      const meta = JSON.parse(await readFile(metaPath, "utf8"));
      return {
        source_id: sys.source_id,
        key_id: meta.key_id || sys.key_id,
        public_key_b64: meta.public_key_b64,
        private_key_path: keyPath,
        state_dir: join(localDir, "state"),
      };
    }
    const pair = await sdk.generateKeyPair();
    await conn.writePrivateKey(keyPath, pair.privateKey, { force: true });
    const meta = {
      source_id: sys.source_id,
      key_id: sys.key_id,
      public_key_b64: pair.publicKeyB64,
      created_at: new Date().toISOString(),
      note: "auto-generated by bank-simulator (provision Demo Bank to register this key)",
    };
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
    await chmod(metaPath, 0o600).catch(() => undefined);
    return {
      source_id: sys.source_id,
      key_id: sys.key_id,
      public_key_b64: pair.publicKeyB64,
      private_key_path: keyPath,
      state_dir: join(localDir, "state"),
    };
  }

  /**
   * Lazily open an in-process Connector for a system id (los / core / pay).
   * @param {string} id
   */
  async get(id) {
    const sys = SYSTEMS.find((s) => s.id === id || s.source_id === id);
    if (!sys || sys.external) return null;
    const existing = this.connectors.get(sys.id);
    if (existing) return existing;
    const inflight = this.opening.get(sys.id);
    if (inflight) return inflight;

    const openPromise = (async () => {
      const material = this.keys.get(sys.id);
      if (!material) return null;
      const apiBase = (this.cfg.apiBase ?? "").trim().replace(/\/+$/, "");
      const ingestKey = (this.cfg.ingestKey ?? "").trim();
      if (!apiBase || !ingestKey) {
        throw new Error("Connector needs apiBase and ingestKey (configure Setup or env)");
      }
      const conn = await loadConnectorPkg();
      const connector = await conn.createConnector({
        source_id: material.source_id,
        key_id: material.key_id,
        private_key_path: material.private_key_path,
        aegis_url: apiBase,
        ingest_path: "/v1/aegis/source-events",
        confirm_path: "/v1/aegis/executions/confirm",
        ingest_bearer: ingestKey,
        state_dir: material.state_dir,
        listen: { host: "127.0.0.1", port: SOURCE_PORTS[sys.source_id] ?? 0 },
        sync_wait_ms: 8_000,
        request_timeout_ms: 15_000,
        retry: { initial_ms: 400, max_ms: 8_000, factor: 2, jitter: 0.1 },
        demo_seq_catchup: true,
      });
      this.connectors.set(sys.id, connector);
      return connector;
    })();

    this.opening.set(sys.id, openPromise);
    try {
      return await openPromise;
    } finally {
      this.opening.delete(sys.id);
    }
  }

  /**
   * Sign + deliver a business event via the system's Connector.
   * @param {string} id  system id (los / core / pay)
   * @param {Record<string, unknown>} event
   * @param {{ calls?: unknown[] }} [opts]
   */
  async submit(id, event, opts = {}) {
    const sys = SYSTEMS.find((s) => s.id === id || s.source_id === id);
    if (!sys) throw new Error(`Unknown system ${id}`);
    const connector = await this.get(sys.id);
    if (!connector) throw new Error(`No Connector for ${id}`);
    const apiBase = (this.cfg.apiBase ?? "").trim().replace(/\/+$/, "");
    const url = `${apiBase}/v1/aegis/source-events`;
    const idem =
      typeof event.idempotency_key === "string" ? event.idempotency_key : undefined;
    const result = await connector.submit(event, idem);
    if (opts.calls) {
      opts.calls.push({
        method: "POST",
        endpoint: url,
        via: "aegis-connector",
        source_id: sys.source_id,
        key_id: this.keys.get(sys.id)?.key_id,
        headers: { Authorization: "Bearer aegis_\u2026****", "Content-Type": "application/json" },
        payload: event,
        response: {
          status: result.status === "delivered" ? 200 : 202,
          body: result.status === "delivered" ? result.receipt : result,
        },
      });
    }
    if (result.status !== "delivered") {
      const err = connector.health()?.last_error;
      throw new Error(
        `Connector queued (not delivered within sync_wait): ${err ?? JSON.stringify(result)}`,
      );
    }
    return {
      status: 200,
      data: result.receipt,
      seq: result.seq,
      source_signed: true,
    };
  }

  async close() {
    this.opening.clear();
    for (const [id, c] of this.connectors) {
      try {
        await c.close();
      } catch {
        /* ignore */
      }
      this.connectors.delete(id);
    }
  }

  /**
   * Health for the systems panel. Merges real Connector state when open.
   * @param {{ connected: boolean, apiBase: string }} base
   */
  health(base) {
    return SYSTEMS.map((sys) => {
      if (sys.external) {
        const url = process.env.DEMO_BUREAU_URL?.trim() || sys.default_url;
        return {
          id: sys.id,
          name: sys.name,
          source_id: sys.source_id,
          key_id: sys.key_id,
          kind: sys.kind,
          role: sys.role,
          connected: true,
          connection: url,
          last_seq: null,
          outbox_size: 0,
          mode: "external_http",
          public_key_hint: "see bureau /v1/keys",
        };
      }
      const material = this.keys.get(sys.id);
      const connector = this.connectors.get(sys.id);
      const h = connector ? connector.health() : null;
      return {
        id: sys.id,
        name: sys.name,
        source_id: sys.source_id,
        key_id: material?.key_id ?? sys.key_id,
        kind: sys.kind,
        role: sys.role,
        connected: Boolean(h?.connected ?? base.connected),
        connection: base.connected ? base.apiBase : "not configured",
        last_seq: h?.last_seq ?? 0,
        outbox_size: h?.outbox_size ?? 0,
        mode: connector ? "aegis-connector" : "key_ready",
        public_key_hint: material?.public_key_b64
          ? `${material.public_key_b64.slice(0, 12)}…`
          : "",
        key_path: material?.private_key_path ?? null,
      };
    });
  }
}
