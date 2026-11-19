/**
 * Stage 6 red-team: direct DB change observed by collector → exception;
 * matched collector + app event → G3.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { issueForensicReceipt } from "../src/forensic/issue.js";
import { getCurrentGrade } from "../src/forensic/case-provenance.js";
import { publishReceiptSigningKey } from "../src/repo/receipt-keys.js";
import { resolveReceiptSigning } from "../src/crypto/receipt-signing.js";
import { paramsHash } from "@salanor/aegis-sdk";
import {
  hashMatchParams,
  insertCollectorCdcEvent,
  pickMatchFields,
  reconcileCollectorEvents,
} from "../src/reconciliation/collector-match.js";
import { runReconciliation } from "../src/reconciliation/run.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const KEY_ID = "receipt_collector_test";
const PERIOD_START = "2026-11-01T00:00:00.000Z";
const PERIOD_END = "2026-11-20T00:00:00.000Z";

describeIfDb("collector CDC reconciliation (Stage 6)", () => {
  let privateKeyB64: string;
  const signingKey = () => ({ key_id: KEY_ID, private_key_b64: privateKeyB64 });

  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    const privateKey = ed.utils.randomPrivateKey();
    privateKeyB64 = Buffer.from(privateKey).toString("base64");
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = privateKeyB64;
    process.env.AEGIS_RECEIPT_KEY_ID = KEY_ID;
    const signing = await resolveReceiptSigning({
      override: { key_id: KEY_ID, private_key_b64: privateKeyB64 },
    });
    await publishReceiptSigningKey(pool, signing);
  });

  afterAll(async () => {
    await closePool();
  });

  async function seedAppCase(caseId: string) {
    const pool = getPool();
    const attrs = {
      amount: "1000000",
      currency: "RWF",
      beneficiary_account: "ACCT-OK",
      product: "retail_loan",
    };
    await pool.query(
      `INSERT INTO bank_case (
         case_id, organization_id, idempotency_key, status, outcome, mode,
         attributes, created_at
       ) VALUES ($1,$2,$3,'approved','allow','enforce',$4::jsonb,$5::timestamptz)
       ON CONFLICT (organization_id, case_id) DO UPDATE
         SET status = EXCLUDED.status, outcome = EXCLUDED.outcome`,
      [
        caseId,
        ORG,
        `idem_${caseId}`,
        JSON.stringify(attrs),
        "2026-11-10T12:00:00.000Z",
      ],
    );
    await issueForensicReceipt(pool, {
      organization_id: ORG,
      case_id: caseId,
      decision_id: `dec_${caseId}`,
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        {
          event_id: `evt_${caseId}`,
          event_hash: `sha256:${randomUUID().replace(/-/g, "")}`,
          sequence_num: 1,
        },
      ],
      attributes: attrs,
      issued_at: "2026-11-10T12:00:00.000Z",
      signingKey: signingKey(),
    });
  }

  it("red team: direct DB change detected by collector → db_change_without_event", async () => {
    const pool = getPool();
    const caseId = `LN-CDC-DIRECT-${randomUUID().slice(0, 8)}`;
    // No app event / receipt — only a collector observation of a ledger write.
    await insertCollectorCdcEvent(pool, {
      organization_id: ORG,
      source_id: "src_core_cdc",
      case_id: caseId,
      table_name: "ledger_entry",
      operation: "update",
      row_key: { case_id: caseId },
      new_values_hash: "b".repeat(64),
      lsn: `0/${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      captured_at: "2026-11-12T10:00:00.000Z",
    });

    const result = await runReconciliation(pool, {
      organization_id: ORG,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
      now: new Date("2026-11-18T12:00:00.000Z"),
    });

    const hit = result.exceptions.find(
      (e) =>
        e.kind === "db_change_without_event" && e.case_id === caseId,
    );
    expect(hit).toBeTruthy();
    expect(hit!.detail).toMatchObject({
      reason: "ledger_row_changed_without_app_event",
      collector_source_id: "src_core_cdc",
    });
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G0");
  });

  it("matched collector + app event upgrades case to G3", async () => {
    const pool = getPool();
    const caseId = `LN-CDC-MATCH-${randomUUID().slice(0, 8)}`;
    await seedAppCase(caseId);
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G0");

    const matchParams = pickMatchFields({
      amount: "1000000",
      currency: "RWF",
      beneficiary_account: "ACCT-OK",
    })!;
    const valuesHash = hashMatchParams(matchParams);

    await insertCollectorCdcEvent(pool, {
      organization_id: ORG,
      source_id: "src_core_cdc",
      case_id: caseId,
      table_name: "ledger_entry",
      operation: "insert",
      row_key: { case_id: caseId },
      new_values_hash: valuesHash,
      lsn: `0/${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      captured_at: "2026-11-12T11:00:00.000Z",
    });

    const match = await reconcileCollectorEvents(pool, {
      organization_id: ORG,
      run_id: `run_${randomUUID()}`,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      now: new Date("2026-11-18T12:00:00.000Z"),
      signingKey: signingKey(),
    });
    expect(match.matched).toContain(caseId);
    expect(
      match.exceptions.filter((e) => e.case_id === caseId),
    ).toHaveLength(0);
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G3");
  });

  it("value mismatch raises db_value_mismatch and does not grant G3", async () => {
    const pool = getPool();
    const caseId = `LN-CDC-MISMATCH-${randomUUID().slice(0, 8)}`;
    await seedAppCase(caseId);

    await insertCollectorCdcEvent(pool, {
      organization_id: ORG,
      source_id: "src_core_cdc",
      case_id: caseId,
      table_name: "bank_transaction",
      operation: "update",
      row_key: { case_id: caseId },
      new_values_hash: paramsHash({
        amount: "999999",
        currency: "RWF",
        beneficiary_account: "ACCT-OK",
      }),
      lsn: `0/${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      captured_at: "2026-11-12T12:00:00.000Z",
    });

    const match = await reconcileCollectorEvents(pool, {
      organization_id: ORG,
      run_id: `run_${randomUUID()}`,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      now: new Date("2026-11-18T12:00:00.000Z"),
      signingKey: signingKey(),
    });
    expect(match.matched).not.toContain(caseId);
    expect(
      match.exceptions.some(
        (e) => e.kind === "db_value_mismatch" && e.case_id === caseId,
      ),
    ).toBe(true);
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G0");
  });

  it("later mismatch after G3 keeps grade and marks contradicted", async () => {
    const pool = getPool();
    const caseId = `LN-CDC-CONTRA-${randomUUID().slice(0, 8)}`;
    await seedAppCase(caseId);
    const goodHash = hashMatchParams(
      pickMatchFields({
        amount: "1000000",
        currency: "RWF",
        beneficiary_account: "ACCT-OK",
      })!,
    );
    await insertCollectorCdcEvent(pool, {
      organization_id: ORG,
      source_id: "src_core_cdc",
      case_id: caseId,
      table_name: "bank_transaction",
      operation: "insert",
      row_key: { case_id: caseId },
      new_values_hash: goodHash,
      lsn: `0/${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      captured_at: "2026-11-12T11:00:00.000Z",
    });
    await reconcileCollectorEvents(pool, {
      organization_id: ORG,
      run_id: `run_${randomUUID()}`,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      now: new Date("2026-11-18T12:00:00.000Z"),
      signingKey: signingKey(),
    });
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G3");

    await insertCollectorCdcEvent(pool, {
      organization_id: ORG,
      source_id: "src_core_cdc",
      case_id: caseId,
      table_name: "bank_transaction",
      operation: "update",
      row_key: { case_id: caseId },
      new_values_hash: paramsHash({
        amount: "42",
        currency: "RWF",
        beneficiary_account: "ACCT-OK",
      }),
      lsn: `0/${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      captured_at: "2026-11-12T13:00:00.000Z",
    });
    const second = await reconcileCollectorEvents(pool, {
      organization_id: ORG,
      run_id: `run_${randomUUID()}`,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      now: new Date("2026-11-18T13:00:00.000Z"),
      signingKey: signingKey(),
    });
    expect(second.contradicted).toContain(caseId);
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G3");
    const hit = second.exceptions.find(
      (e) => e.kind === "db_value_mismatch" && e.case_id === caseId,
    );
    expect(hit?.detail).toMatchObject({
      reason: "collector_values_contradict_after_g3",
      contradicted_at: "2026-11-18T13:00:00.000Z",
    });
  });
});
