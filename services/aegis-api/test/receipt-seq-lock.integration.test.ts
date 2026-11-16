/**
 * Regression: concurrent issueForensicReceipt must not duplicate
 * (organization_id, seq). Root cause was SELECT FOR UPDATE under autocommit
 * (lock released after the SELECT) — fixed with advisory lock held through
 * allocate + insert + commitReceiptSeq.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { issueForensicReceipt } from "../src/forensic/issue.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;

describeIfDb("receipt sequence lock (concurrent issue)", () => {
  let privateKeyB64: string;

  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    const privateKey = ed.utils.randomPrivateKey();
    privateKeyB64 = Buffer.from(privateKey).toString("base64");
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = privateKeyB64;
    process.env.AEGIS_RECEIPT_KEY_ID = "receipt_test";
  });

  afterAll(async () => {
    await closePool();
  });

  it("assigns distinct seq under concurrent issueForensicReceipt", async () => {
    const pool = getPool();
    const n = 16;
    const tasks = Array.from({ length: n }, async (_, i) => {
      const issued = await issueForensicReceipt(pool, {
        organization_id: ORG,
        case_id: `case_seq_${randomUUID().slice(0, 8)}_${i}`,
        decision_id: `dec_seq_${i}`,
        outcome: "allow",
        mode: "enforce",
        matched_rules: [],
        sealed_events: [
          {
            event_id: `evt_seq_${i}_${randomUUID().slice(0, 8)}`,
            event_hash: `sha256:${i}`,
            sequence_num: i + 1,
          },
        ],
        signingKey: {
          key_id: "receipt_test",
          private_key_b64: privateKeyB64,
        },
      });
      return issued.seq;
    });

    const seqs = await Promise.all(tasks);
    expect(new Set(seqs).size).toBe(n);
  });
});
