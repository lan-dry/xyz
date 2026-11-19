/**
 * One Connector instance per system (simulated with separate keys).
 * Holds key id, sequence, and an on-disk-style outbox counter without embedding
 * Aegis API internals — only the published SDK for key generation when available.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SYSTEMS } from "./systems.mjs";

/** @typedef {{ source_id: string, key_id: string, last_seq: number, outbox_size: number, connected: boolean, public_key_hint: string, mode: string }} SystemHealth */

export class SimulatedConnectors {
  /**
   * @param {string} dataDir
   * @param {{ apiBase?: string, ingestKey?: string }} cfg
   */
  constructor(dataDir, cfg = {}) {
    this.dataDir = dataDir;
    this.cfg = cfg;
    /** @type {Map<string, { last_seq: number, outbox: unknown[], key_id: string, public_key_hint: string, seed_hex: string }>} */
    this.state = new Map();
    this.ready = false;
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    for (const sys of SYSTEMS) {
      if (sys.external) continue;
      const path = join(this.dataDir, `${sys.id}.json`);
      let row;
      try {
        row = JSON.parse(await readFile(path, "utf8"));
      } catch {
        row = {
          source_id: sys.source_id,
          key_id: sys.key_id,
          last_seq: 0,
          outbox: [],
          seed_hex: randomBytes(32).toString("hex"),
          public_key_hint: `ed25519_${sys.id}_…`,
        };
        await writeFile(path, JSON.stringify(row, null, 2), { mode: 0o600 });
      }
      this.state.set(sys.id, {
        last_seq: Number(row.last_seq) || 0,
        outbox: Array.isArray(row.outbox) ? row.outbox : [],
        key_id: row.key_id || sys.key_id,
        public_key_hint: row.public_key_hint || `ed25519_${sys.id}_…`,
        seed_hex: row.seed_hex || randomBytes(32).toString("hex"),
      });
    }
    this.ready = true;
  }

  async persist(id) {
    const row = this.state.get(id);
    const sys = SYSTEMS.find((s) => s.id === id);
    if (!row || !sys) return;
    await writeFile(
      join(this.dataDir, `${id}.json`),
      JSON.stringify(
        {
          source_id: sys.source_id,
          key_id: row.key_id,
          last_seq: row.last_seq,
          outbox: row.outbox,
          seed_hex: row.seed_hex,
          public_key_hint: row.public_key_hint,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }

  /**
   * Advance seq as if the Connector signed and delivered (or queued).
   * @param {string} id
   * @param {{ queue?: boolean }} [opts]
   */
  async recordSend(id, opts = {}) {
    const row = this.state.get(id);
    if (!row) return null;
    row.last_seq += 1;
    if (opts.queue) {
      row.outbox.push({ seq: row.last_seq, at: new Date().toISOString() });
    }
    await this.persist(id);
    return { seq: row.last_seq, outbox_size: row.outbox.length };
  }

  async flushOutbox(id) {
    const row = this.state.get(id);
    if (!row) return 0;
    const n = row.outbox.length;
    row.outbox = [];
    await this.persist(id);
    return n;
  }

  /** Crash/restart simulation: leave outbox, keep last_seq (no reuse). */
  async simulateCrashRestart(id) {
    const row = this.state.get(id);
    if (!row) return null;
    const before = { last_seq: row.last_seq, outbox_size: row.outbox.length };
    // Restart: seq must not go backwards; outbox retained until flush.
    await this.persist(id);
    return {
      before,
      after: { last_seq: row.last_seq, outbox_size: row.outbox.length },
      no_seq_reuse: true,
      nothing_lost: row.outbox.length === before.outbox_size,
    };
  }

  /**
   * @returns {SystemHealth[]}
   */
  health() {
    const apiBase = (this.cfg.apiBase ?? "").trim();
    const connected = Boolean(apiBase && this.cfg.ingestKey);
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
      const row = this.state.get(sys.id);
      return {
        id: sys.id,
        name: sys.name,
        source_id: sys.source_id,
        key_id: row?.key_id ?? sys.key_id,
        kind: sys.kind,
        role: sys.role,
        connected,
        connection: connected ? apiBase : "not configured",
        last_seq: row?.last_seq ?? 0,
        outbox_size: row?.outbox.length ?? 0,
        mode: "simulated_connector",
        public_key_hint: row?.public_key_hint ?? "",
      };
    });
  }
}
