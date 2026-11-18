import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateKeyPair,
  verifyEnvelope,
  type SignedEnvelope,
} from "@salanor/aegis-sdk";
import { createCollector } from "../src/collector.js";
import type { CollectorConfig } from "../src/config.js";
import { buildCollectorEvent, resolveCaseId } from "../src/event.js";
import { hashNewValues } from "../src/hash.js";
import { writePrivateKey } from "../src/keystore.js";
import {
  checkLogicalDecoding,
  cdcChangeFromRow,
  PgoutputLogicalStream,
} from "../src/pgoutput.js";
import { SimulatedChangeStream } from "../src/simulated.js";
import { LogicalDecodingUnavailableError } from "../src/types.js";

const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop()!;
    await rm(d, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "aegis-collector-"));
  dirs.push(d);
  return d;
}

describe("collector event + hash", () => {
  it("hashes new values with JCS sha256", () => {
    const h = hashNewValues({ amount: "1000", currency: "RWF" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashNewValues(null)).toBe("");
  });

  it("maps case_id from row_key", () => {
    const change = cdcChangeFromRow({
      table: "ledger_entry",
      operation: "update",
      row_key: { case_id: "LN-1", id: "9" },
      new_values: { amount: "1" },
      lsn: "0/1",
    });
    expect(
      resolveCaseId(change, [
        { table: "ledger_entry", case_id_column: "case_id" },
      ]),
    ).toBe("LN-1");
    const ev = buildCollectorEvent(change, [
      { table: "public.ledger_entry", case_id_column: "case_id" },
    ]);
    expect(ev.event_type).toBe("cdc.row_change");
    expect(ev.case_id).toBe("LN-1");
    expect(ev.attributes.cdc.lsn).toBe("0/1");
    expect(ev.attributes.cdc.new_values_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("createCollector signs and posts", () => {
  it("source-signs CDC events and POSTs to collector ingest", async () => {
    const dir = await tempDir();
    const keys = await generateKeyPair();
    const keyPath = join(dir, "collector.key.json");
    await writePrivateKey(keyPath, keys.privateKey, { force: true });

    const posted: SignedEnvelope[] = [];
    const stream = new SimulatedChangeStream();
    const config: CollectorConfig = {
      source_id: "src_core_cdc",
      key_id: "k_cdc_test",
      private_key_path: keyPath,
      database_url: "postgresql://collector:x@127.0.0.1:5435/aegis",
      publication: "aegis_collector",
      slot: "aegis_collector_slot",
      tables: [{ table: "ledger_entry", key_columns: ["case_id"] }],
      case_id_mappings: [
        { table: "ledger_entry", case_id_column: "case_id" },
      ],
      aegis_url: "http://127.0.0.1:9",
      ingest_path: "/v1/aegis/collector-events",
      ingest_bearer: "test-bearer",
      state_dir: join(dir, "state"),
      request_timeout_ms: 5_000,
      poll_ms: 50,
    };

    const collector = await createCollector(config, {
      stream,
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as SignedEnvelope;
        posted.push(body);
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      },
    });

    const change = cdcChangeFromRow({
      table: "ledger_entry",
      operation: "update",
      row_key: { case_id: "LN-DIRECT-1" },
      new_values: { amount: "999999", currency: "RWF" },
      lsn: "0/ABC",
      captured_at: "2026-11-19T00:00:00.000Z",
    });
    stream.push(change);
    stream.close();

    const result = await collector.run();
    expect(result.delivered).toBe(1);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.source_id).toBe("src_core_cdc");
    expect(posted[0]!.event.event_type).toBe("cdc.row_change");
    expect(posted[0]!.event.case_id).toBe("LN-DIRECT-1");
    const v = await verifyEnvelope(posted[0]!, keys.publicKey);
    expect(v.ok).toBe(true);
  });
});

describe("pgoutput readiness", () => {
  it("PgoutputLogicalStream refuses when wal_level is not logical", async () => {
    const demoUrl =
      process.env.AEGIS_COLLECTOR_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
    let status;
    try {
      status = await checkLogicalDecoding(demoUrl);
    } catch {
      // DB unreachable — skip probe assertion
      return;
    }
    if (status.ready) {
      // Unexpected on demo (usually replica); still ensure stream exists.
      expect(status.wal_level).toBe("logical");
      return;
    }
    expect(status.wal_level).not.toBe("logical");
    const stream = new PgoutputLogicalStream({
      database_url: demoUrl,
      publication: "aegis_collector",
      slot: "aegis_collector_slot",
      tables: [{ table: "ledger_entry", key_columns: ["id"] }],
    });
    await expect(async () => {
      for await (const _ of stream.changes()) {
        /* drain */
      }
    }).rejects.toBeInstanceOf(LogicalDecodingUnavailableError);
  });
});
