import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SignedEnvelope } from "@salanor/aegis-sdk";
import { appendLineDurable, atomicWriteFile } from "./fsutil.js";

/** In-process open state dirs. Survives PID reuse on Docker/Railway (often PID 1). */
const openStateDirs = new Set<string>();

export interface DeliveredRecord {
  seq: number;
  idempotency_key: string;
  event_hash: string;
  delivered_at: string;
  /** HTTP status of the accepting response (2xx; Aegis returns 200 for idempotent duplicates). */
  status: number;
  /** Response body from Aegis (the receipt). */
  receipt: unknown;
}

export interface OutboxEntry {
  seq: number;
  envelope: SignedEnvelope;
}

interface StateFile {
  version: 1;
  source_id: string;
  last_seq: number;
}

const SEQ_WIDTH = 16;

function outboxName(seq: number): string {
  return `${String(seq).padStart(SEQ_WIDTH, "0")}.json`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Crash-safe on-disk state for one source:
 *
 *   state.json          { last_seq }                        atomically replaced
 *   outbox/<seq>.json   signed envelope awaiting delivery   immutable, atomic create
 *   delivered.jsonl     append-only ack log                 fsync'd per line
 *   connector.lock      pid lock (single process per dir)
 *
 * Invariants:
 *  - An envelope is written to outbox/ and last_seq is persisted BEFORE it is ever sent, so a
 *    seq can never be reused, even after a crash between the two writes (last_seq is
 *    recomputed on open as max(state.json, outbox/, delivered.jsonl)).
 *  - An outbox file is removed only after the ack is durably logged; on open, any outbox file
 *    whose idempotency key is already in delivered.jsonl is dropped instead of re-sent.
 *  - Outbox envelopes are never rewritten, so retries send byte-identical content with the
 *    same idempotency key.
 */
export class ConnectorState {
  private readonly outbox = new Map<number, SignedEnvelope>();
  private readonly delivered = new Map<string, DeliveredRecord>();
  private _lastSeq = 0;
  private closed = false;

  private constructor(
    readonly dir: string,
    readonly sourceId: string,
  ) {}

  private get statePath(): string {
    return join(this.dir, "state.json");
  }
  private get outboxDir(): string {
    return join(this.dir, "outbox");
  }
  private get deliveredPath(): string {
    return join(this.dir, "delivered.jsonl");
  }
  private get lockPath(): string {
    return join(this.dir, "connector.lock");
  }

  static async open(dir: string, sourceId: string): Promise<ConnectorState> {
    const absDir = resolve(dir);
    if (openStateDirs.has(absDir)) {
      throw new Error(`State directory ${absDir} is already open in this process`);
    }
    const state = new ConnectorState(absDir, sourceId);
    await mkdir(state.outboxDir, { recursive: true, mode: 0o700 });
    await state.acquireLock();
    try {
      await state.load();
      openStateDirs.add(absDir);
    } catch (err) {
      await state.releaseLock();
      throw err;
    }
    return state;
  }

  get lastSeq(): number {
    return this._lastSeq;
  }

  get outboxSize(): number {
    return this.outbox.size;
  }

  /** Pending envelopes in ascending seq order. */
  listOutbox(): OutboxEntry[] {
    return [...this.outbox.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([seq, envelope]) => ({ seq, envelope }));
  }

  findByIdempotencyKey(
    key: string,
  ): { state: "queued"; entry: OutboxEntry } | { state: "delivered"; record: DeliveredRecord } | undefined {
    const record = this.delivered.get(key);
    if (record) {
      return { state: "delivered", record };
    }
    for (const [seq, envelope] of this.outbox) {
      if (envelope.idempotency_key === key) {
        return { state: "queued", entry: { seq, envelope } };
      }
    }
    return undefined;
  }

  /** Durably queue a signed envelope and advance last_seq. envelope.seq must be lastSeq + 1. */
  async appendOutbox(envelope: SignedEnvelope): Promise<void> {
    if (envelope.seq !== this._lastSeq + 1) {
      throw new Error(`seq must be ${this._lastSeq + 1}, got ${envelope.seq}`);
    }
    await atomicWriteFile(join(this.outboxDir, outboxName(envelope.seq)), JSON.stringify(envelope));
    this.outbox.set(envelope.seq, envelope);
    this._lastSeq = envelope.seq;
    await this.writeStateFile();
  }

  /**
   * After Aegis reports seq_replay, adopt the remote last accepted seq so the next
   * envelope uses remote+1 and never reuses a number. Drops outbox entries with
   * seq <= remoteLast (they cannot succeed and must not be retried with the same seq).
   * Returns the new local last_seq.
   */
  async syncFromRemoteLastSeq(remoteLast: number): Promise<{ last_seq: number; dropped: number[] }> {
    if (!Number.isSafeInteger(remoteLast) || remoteLast < 0) {
      throw new Error(`Invalid remote last_seq: ${remoteLast}`);
    }
    const dropped: number[] = [];
    for (const seq of [...this.outbox.keys()].sort((a, b) => a - b)) {
      if (seq <= remoteLast) {
        await unlink(join(this.outboxDir, outboxName(seq))).catch(() => undefined);
        this.outbox.delete(seq);
        dropped.push(seq);
      }
    }
    if (remoteLast > this._lastSeq) {
      this._lastSeq = remoteLast;
    }
    await this.writeStateFile();
    return { last_seq: this._lastSeq, dropped };
  }

  /** Record an accepted delivery and drop the envelope from the outbox. */
  async markDelivered(seq: number, status: number, receipt: unknown): Promise<DeliveredRecord> {
    const envelope = this.outbox.get(seq);
    if (!envelope) {
      throw new Error(`No outbox entry for seq ${seq}`);
    }
    const record: DeliveredRecord = {
      seq,
      idempotency_key: envelope.idempotency_key,
      event_hash: envelope.event_hash,
      delivered_at: new Date().toISOString(),
      status,
      receipt,
    };
    await appendLineDurable(this.deliveredPath, JSON.stringify(record));
    this.delivered.set(record.idempotency_key, record);
    await unlink(join(this.outboxDir, outboxName(seq))).catch(() => undefined);
    this.outbox.delete(seq);
    return record;
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      await this.releaseLock();
    }
  }

  // ---- internals ---------------------------------------------------------

  private async acquireLock(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await writeFile(this.lockPath, String(process.pid), { flag: "wx", mode: 0o600 });
        return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
          throw err;
        }
        const pid = Number.parseInt(await readFile(this.lockPath, "utf8").catch(() => ""), 10);
        // Live other process → refuse. Same PID is usually a stale lock after
        // container restart (Railway/Docker often reuse PID 1); reclaim unless
        // openStateDirs already tracks a live open (checked in open()).
        if (Number.isInteger(pid) && pid !== process.pid && isProcessAlive(pid)) {
          throw new Error(`State directory ${this.dir} is locked by running process ${pid}`);
        }
        await unlink(this.lockPath).catch(() => undefined);
      }
    }
    throw new Error(`Cannot acquire lock on ${this.dir}`);
  }

  private async releaseLock(): Promise<void> {
    openStateDirs.delete(this.dir);
    await unlink(this.lockPath).catch(() => undefined);
  }

  private async writeStateFile(): Promise<void> {
    const file: StateFile = { version: 1, source_id: this.sourceId, last_seq: this._lastSeq };
    await atomicWriteFile(this.statePath, JSON.stringify(file));
  }

  private async load(): Promise<void> {
    // leftovers from a crash mid-write are never trusted
    for (const dir of [this.dir, this.outboxDir]) {
      for (const name of await readdir(dir)) {
        if (name.endsWith(".tmp")) {
          await unlink(join(dir, name)).catch(() => undefined);
        }
      }
    }

    let persistedSeq = 0;
    let haveStateFile = false;
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as StateFile;
      if (parsed.version !== 1 || !Number.isSafeInteger(parsed.last_seq) || parsed.last_seq < 0) {
        throw new Error("invalid state.json");
      }
      if (parsed.source_id !== this.sourceId) {
        throw new Error(
          `State directory belongs to source_id ${parsed.source_id}, config says ${this.sourceId}`,
        );
      }
      persistedSeq = parsed.last_seq;
      haveStateFile = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }

    await this.loadDeliveredLog();

    let maxSeq = Math.max(persistedSeq, ...[...this.delivered.values()].map((r) => r.seq), 0);
    for (const name of (await readdir(this.outboxDir)).sort()) {
      if (!/^\d{16}\.json$/.test(name)) {
        continue;
      }
      const seq = Number.parseInt(name.slice(0, SEQ_WIDTH), 10);
      const envelope = JSON.parse(
        await readFile(join(this.outboxDir, name), "utf8"),
      ) as SignedEnvelope;
      if (envelope.seq !== seq || envelope.source_id !== this.sourceId) {
        throw new Error(`Outbox file ${name} does not match its contents`);
      }
      maxSeq = Math.max(maxSeq, seq);
      if (this.delivered.has(envelope.idempotency_key)) {
        // acked but crashed before the file was removed: never send it again
        await unlink(join(this.outboxDir, name));
        continue;
      }
      this.outbox.set(seq, envelope);
    }

    this._lastSeq = maxSeq;
    if (!haveStateFile || maxSeq !== persistedSeq) {
      await this.writeStateFile();
    }
  }

  private async loadDeliveredLog(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.deliveredPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }
    const lines = text.split("\n").filter((line) => line.length > 0);
    let torn = false;
    lines.forEach((line, i) => {
      try {
        const record = JSON.parse(line) as DeliveredRecord;
        this.delivered.set(record.idempotency_key, record);
      } catch (err) {
        if (i === lines.length - 1) {
          torn = true; // partial last line from a crash mid-append
        } else {
          throw new Error(`Corrupt delivered.jsonl at line ${i + 1}: ${(err as Error).message}`);
        }
      }
    });
    if (torn || !text.endsWith("\n")) {
      const good = [...this.delivered.values()].map((r) => JSON.stringify(r)).join("\n");
      await atomicWriteFile(this.deliveredPath, good.length > 0 ? `${good}\n` : "");
    }
  }
}
