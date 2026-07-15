import { signEvent, type ApsEvent } from "@salanor/aegis";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { persistSignedEvent } from "../src/ingest/persist.js";
import { sha256FileHex } from "../src/compliance/integrity.js";
import { exportZipPath } from "../src/compliance/storage.js";
import { runComplianceExport } from "../src/compliance/worker.js";
import {
  createComplianceExport,
  getComplianceExport,
} from "../src/repo/compliance-export.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = "11111111-1111-4111-8111-111111111111";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";
const USER = "22222222-2222-4222-8222-222222222222";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

let exportDir: string;

function buildEvent(emittedAt: string): ApsEvent {
  return {
    schema_version: 1,
    event_id: `evt_exp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organization_id: ORG,
    trace_id: `trc_exp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    agent_id: DEV_AGENT,
    key_id: DEV_KEY,
    emitted_at: emittedAt,
    actor_type: "agent",
    actor_principal: "export-test",
    action_kind: "tool_call",
    policy_decision: "allow",
    payload: { export: true },
  };
}

describeIfDb("compliance export (Stage 10 exit)", () => {
  beforeAll(async () => {
    exportDir = await mkdtemp(join(tmpdir(), "aegis-exports-"));
    process.env.COMPLIANCE_EXPORT_DIR = exportDir;

    await migrateUp();
    const seedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../tools/seed/dev.sql",
    );
    await getPool().query(readFileSync(seedPath, "utf8"));

    const periodStart = "2026-05-20T00:00:00.000Z";
    const periodEnd = "2026-05-22T23:59:59.999Z";

    for (const emittedAt of [
      "2026-05-21T10:00:00.000Z",
      "2026-05-21T11:00:00.000Z",
    ]) {
      const signed = await signEvent(buildEvent(emittedAt), {
        privateKeyB64,
        keyId: DEV_KEY,
      });
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await persistSignedEvent(client, signed, undefined);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    }

    void periodStart;
    void periodEnd;
  });

  afterAll(async () => {
    await rm(exportDir, { recursive: true, force: true });
    await closePool();
  });

  it("request export for date range → ready + integrity_hash verifies", async () => {
    const periodStart = new Date("2026-05-20T00:00:00.000Z");
    const periodEnd = new Date("2026-05-22T23:59:59.999Z");

    const created = await createComplianceExport(getPool(), {
      organizationId: ORG,
      requestedBy: USER,
      bundleType: "combined",
      periodStart,
      periodEnd,
    });

    expect(created.status).toBe("pending");

    const result = await runComplianceExport(getPool(), created.export_id);
    expect(result.status).toBe("ready");
    expect(result.integrity_hash).toMatch(/^[a-f0-9]{64}$/);

    const row = await getComplianceExport(
      getPool(),
      ORG,
      created.export_id,
    );
    expect(row?.status).toBe("ready");
    expect(row?.storage_uri).toContain(created.export_id);
    expect(row?.integrity_hash).toBe(result.integrity_hash);

    expect(row?.event_count).toBeGreaterThanOrEqual(0);
    expect(Number(row?.byte_size ?? 0)).toBeGreaterThan(100);

    const zipPath = exportZipPath(ORG, created.export_id);
    const zipBytes = await readFile(zipPath);
    expect(zipBytes.length).toBeGreaterThan(100);
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);

    const fileHash = await sha256FileHex(zipPath);
    expect(fileHash).toBe(row?.integrity_hash);
  });
});
