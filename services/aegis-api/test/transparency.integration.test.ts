import { signEvent, type ApsEvent } from "@salanor/aegis";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPublicBundle } from "../../../tools/verifier/verify-lib.js";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { persistSignedEvent } from "../src/ingest/persist.js";
import { getDidDocumentByAgent } from "../src/repo/did.js";
import { buildPublicVerificationBundle } from "../src/transparency/bundle.js";
import { runWitnessBatchForOrg } from "../../aegis-signer/src/batch-lib.js";
import { publishTransparencyLogForOrg } from "../src/transparency/publish.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_SLUG = "dev-org";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

let transparencyEventId: string;

function buildEvent(): ApsEvent {
  return {
    schema_version: 1,
    event_id: `evt_tl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organization_id: ORG,
    trace_id: `trc_tl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    agent_id: DEV_AGENT,
    key_id: DEV_KEY,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: "transparency-test",
    action_kind: "tool_call",
    policy_decision: "allow",
    payload: { transparency: true },
  };
}

describeIfDb("transparency log (Stage 9 exit)", () => {
  beforeAll(async () => {
    await migrateUp();
    const seedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../tools/seed/dev.sql",
    );
    await getPool().query(readFileSync(seedPath, "utf8"));

    const signed = await signEvent(buildEvent(), {
      privateKeyB64,
      keyId: DEV_KEY,
    });
    transparencyEventId = signed.event_id;

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await persistSignedEvent(client, signed, undefined);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    await runWitnessBatchForOrg(getPool(), ORG);
    await publishTransparencyLogForOrg(getPool(), ORG);
  });

  afterAll(async () => {
    await closePool();
  });

  it("did_document is populated for dev agent", async () => {
    const doc = await getDidDocumentByAgent(getPool(), DEV_AGENT);
    expect(doc).not.toBeNull();
    expect(doc!.document_json).toMatchObject({
      id: "did:salanor:dev:agent-01",
    });
  });

  it("public verification bundle passes third-party verifier", async () => {
    const client = await getPool().connect();
    try {
      const bundle = await buildPublicVerificationBundle(
        client,
        ORG_SLUG,
        transparencyEventId,
      );
      expect(bundle).not.toBeNull();

      const result = verifyPublicBundle(bundle!);
      expect(result.errors, JSON.stringify(result)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.witness_ok).toBe(true);
      expect(result.transparency_ok).toBe(true);
      expect(result.leaf_ok).toBe(true);
    } finally {
      client.release();
    }
  });

  it("tampered transparency leaf fails third-party verifier", async () => {
    const client = await getPool().connect();
    try {
      const bundle = await buildPublicVerificationBundle(
        client,
        ORG_SLUG,
        transparencyEventId,
      );
      expect(bundle).not.toBeNull();
      bundle!.transparency.leaf_hash = "0".repeat(64);

      const result = verifyPublicBundle(bundle!);
      expect(result.ok).toBe(false);
      expect(result.transparency_ok).toBe(false);
    } finally {
      client.release();
    }
  });
});
