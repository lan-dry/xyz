/**
 * New forensic isolation coverage (bank_case / forensic_receipt).
 * Kept separate so pre-forensic-demo org-isolation.integration.test.ts stays unchanged.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import {
  ORG_A_ID,
  ORG_B_ID,
  cleanupIsolationFixtures,
  insertAgent,
  insertOrganization,
  insertSigningKey,
} from "./helpers.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

async function cleanupForensicIso(client: import("pg").PoolClient): Promise<void> {
  await client.query(`SET session_replication_role = replica`);
  try {
    await client.query(
      `DELETE FROM forensic_receipt WHERE receipt_id LIKE 'rcpt-iso-%'`,
    );
    await client.query(
      `DELETE FROM bank_case WHERE case_id LIKE 'case-iso-%'`,
    );
  } finally {
    await client.query(`SET session_replication_role = DEFAULT`);
  }
}

describeIfDb("ForensicOrgIsolation", () => {
  beforeAll(async () => {
    await migrateUp();
    const client = await getPool().connect();
    try {
      await client.query(`SET session_replication_role = replica`);
      try {
        await cleanupIsolationFixtures(client);
      } finally {
        await client.query(`SET session_replication_role = DEFAULT`);
      }
      await cleanupForensicIso(client);
      await insertOrganization(client, ORG_A_ID, "test-org-a");
      await insertOrganization(client, ORG_B_ID, "test-org-b");
      await insertAgent(client, "agent-test-a", ORG_A_ID, "a");
      await insertAgent(client, "agent-test-b", ORG_B_ID, "b");
      await insertSigningKey(client, "key-test-a", "agent-test-a", ORG_A_ID);
      await insertSigningKey(client, "key-test-b", "agent-test-b", ORG_B_ID);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await getPool().connect();
    try {
      await cleanupForensicIso(client);
      await client.query(`SET session_replication_role = replica`);
      try {
        await cleanupIsolationFixtures(client);
      } finally {
        await client.query(`SET session_replication_role = DEFAULT`);
      }
    } finally {
      client.release();
    }
    await closePool();
  });

  it("org A cannot read org B bank_case or forensic_receipt", async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO bank_case (
         case_id, organization_id, idempotency_key, outcome, mode, status
       ) VALUES
         ('case-iso-a', $1, 'idem-iso-a', 'allow', 'enforce', 'approved'),
         ('case-iso-b', $2, 'idem-iso-b', 'hold', 'enforce', 'held')
       ON CONFLICT (organization_id, case_id) DO NOTHING`,
      [ORG_A_ID, ORG_B_ID],
    );
    await pool.query(
      `INSERT INTO forensic_receipt (
         receipt_id, organization_id, seq, receipt_hash, decision_id,
         outcome, mode, body, key_id, sig_value_b64
       ) VALUES
         ('rcpt-iso-a', $1, 900001, 'hash-a', 'dec-a', 'allow', 'enforce', '{}'::jsonb, 'key-test-a', 'c2ln'),
         ('rcpt-iso-b', $2, 900001, 'hash-b', 'dec-b', 'hold', 'enforce', '{}'::jsonb, 'key-test-b', 'c2ln')
       ON CONFLICT (receipt_id) DO NOTHING`,
      [ORG_A_ID, ORG_B_ID],
    );

    const casesA = await pool.query<{ case_id: string }>(
      `SELECT case_id FROM bank_case WHERE organization_id = $1`,
      [ORG_A_ID],
    );
    const casesB = await pool.query<{ case_id: string }>(
      `SELECT case_id FROM bank_case WHERE organization_id = $1`,
      [ORG_B_ID],
    );
    expect(casesA.rows.some((r) => r.case_id === "case-iso-b")).toBe(false);
    expect(casesA.rows.some((r) => r.case_id === "case-iso-a")).toBe(true);
    expect(casesB.rows.some((r) => r.case_id === "case-iso-a")).toBe(false);

    const receiptsA = await pool.query<{ receipt_id: string }>(
      `SELECT receipt_id FROM forensic_receipt WHERE organization_id = $1`,
      [ORG_A_ID],
    );
    const receiptsB = await pool.query<{ receipt_id: string }>(
      `SELECT receipt_id FROM forensic_receipt WHERE organization_id = $1`,
      [ORG_B_ID],
    );
    expect(receiptsA.rows.some((r) => r.receipt_id === "rcpt-iso-b")).toBe(false);
    expect(receiptsB.rows.some((r) => r.receipt_id === "rcpt-iso-a")).toBe(false);
    expect(receiptsA.rows.some((r) => r.receipt_id === "rcpt-iso-a")).toBe(true);
  });
});
