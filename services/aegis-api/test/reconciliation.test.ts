/**
 * Stage 4: reconciliation feeds, exception types, G2 upgrade, idempotent rerun,
 * feed row edited after the fact.
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
import { createFeed, ingestFeedBody } from "../src/reconciliation/ingest.js";
import {
  acknowledgeException,
  listExceptions,
  raiseManualException,
  resolveException,
} from "../src/reconciliation/exceptions.js";
import { parseFeedBody } from "../src/reconciliation/parse-feed.js";
import { runReconciliation } from "../src/reconciliation/run.js";
import { RECONCILIATION_EXCEPTION_KINDS } from "../src/reconciliation/types.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const KEY_ID = "receipt_recon_test";

const PERIOD_START = "2026-11-01T00:00:00.000Z";
const PERIOD_END = "2026-11-19T00:00:00.000Z";

describeIfDb("reconciliation + exceptions (Stage 4)", () => {
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

  async function seedCase(opts: {
    caseId: string;
    outcome?: string;
    status?: string;
    amount?: string;
    beneficiary?: string;
    requester?: string;
    approver?: string;
    createdAt?: string;
    workflowId?: string | null;
    withToken?: boolean;
    tokenExpiresAt?: string;
  }) {
    const pool = getPool();
    const attrs: Record<string, unknown> = {
      amount: opts.amount ?? "1000000",
      currency: "RWF",
      beneficiary_account: opts.beneficiary ?? "ACCT-OK",
      product: "retail_loan",
    };
    if (opts.requester) attrs.requester_email = opts.requester;
    if (opts.approver) attrs.approver_email = opts.approver;

    await pool.query(
      `INSERT INTO bank_case (
         case_id, organization_id, idempotency_key, status, outcome, mode,
         attributes, workflow_id, created_at
       ) VALUES ($1,$2,$3,$4,$5,'enforce',$6::jsonb,$7,$8::timestamptz)
       ON CONFLICT (organization_id, case_id) DO UPDATE
         SET status = EXCLUDED.status,
             outcome = EXCLUDED.outcome,
             attributes = EXCLUDED.attributes,
             workflow_id = EXCLUDED.workflow_id,
             created_at = EXCLUDED.created_at`,
      [
        opts.caseId,
        ORG,
        `idem_${opts.caseId}`,
        opts.status ?? "approved",
        opts.outcome ?? "allow",
        JSON.stringify(attrs),
        opts.workflowId ?? null,
        opts.createdAt ?? "2026-11-10T12:00:00.000Z",
      ],
    );

    await issueForensicReceipt(pool, {
      organization_id: ORG,
      case_id: opts.caseId,
      decision_id: `dec_${opts.caseId}`,
      outcome: opts.outcome === "stop" ? "stop" : "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        {
          event_id: `evt_${opts.caseId}`,
          event_hash: `sha256:${randomUUID().replace(/-/g, "")}`,
          sequence_num: 1,
        },
      ],
      attributes: attrs,
      issued_at: opts.createdAt ?? "2026-11-10T12:00:00.000Z",
      signingKey: signingKey(),
    });

    let tokenId: string | null = null;
    if (opts.withToken !== false) {
      tokenId = `tok_${opts.caseId}`;
      const issuedAt = opts.createdAt ?? "2026-11-10T12:00:00.000Z";
      const expiresAt =
        opts.tokenExpiresAt ?? "2026-11-10T13:00:00.000Z";
      await pool.query(
        `INSERT INTO decision_token (
           token_id, organization_id, case_id, decision_id, action_type,
           params_hash, executable_params, issued_at, expires_at, nonce,
           key_id, signature, token_body, status
         ) VALUES (
           $1,$2,$3,$4,'loan.disburse',
           $5,$6::jsonb,$7::timestamptz,$8::timestamptz,$9,
           $10,'sig',$11::jsonb,'issued'
         )
         ON CONFLICT (token_id) DO NOTHING`,
        [
          tokenId,
          ORG,
          opts.caseId,
          `dec_${opts.caseId}`,
          "a".repeat(64),
          JSON.stringify({
            amount: attrs.amount,
            currency: "RWF",
            beneficiary_account: attrs.beneficiary_account,
            product: "retail_loan",
          }),
          issuedAt,
          expiresAt,
          `nonce_${opts.caseId}`,
          KEY_ID,
          JSON.stringify({ token_id: tokenId }),
        ],
      );
    }
    return { tokenId, attrs };
  }

  it("parses JSONL and CSV with column mapping", () => {
    const mapping = {
      case_id: "loan_ref",
      amount: "amt",
      beneficiary_account: "bene",
      executed_at: "posted_at",
      external_id: "txn_id",
    };
    const jsonl = [
      JSON.stringify({
        loan_ref: "LN-1",
        amt: "100",
        bene: "A1",
        posted_at: "2026-11-10T14:00:00.000Z",
        txn_id: "t1",
      }),
    ].join("\n");
    const rows = parseFeedBody(jsonl, mapping, "jsonl");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.case_id).toBe("LN-1");
    expect(rows[0]!.amount).toBe("100");

    const csv =
      "loan_ref,amt,bene,posted_at,txn_id\nLN-2,200,A2,2026-11-10T15:00:00.000Z,t2\n";
    const csvRows = parseFeedBody(csv, mapping, "csv");
    expect(csvRows[0]!.case_id).toBe("LN-2");
    expect(csvRows[0]!.beneficiary_account).toBe("A2");
  });

  it("clean run: matching feed and receipt → zero exceptions, G2 upgrade", async () => {
    const pool = getPool();
    const caseId = `LN-MATCH-${randomUUID().slice(0, 8)}`;
    await seedCase({
      caseId,
      amount: "1500000",
      beneficiary: "ACCT-1",
      tokenExpiresAt: "2026-11-11T00:00:00.000Z",
    });

    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Core Banking ${caseId}`,
      match_key: "case_id",
      column_mapping: {
        case_id: "case_id",
        amount: "amount",
        beneficiary_account: "beneficiary_account",
        executed_at: "executed_at",
        external_id: "external_id",
      },
    });

    const body = JSON.stringify({
      case_id: caseId,
      amount: "1500000",
      beneficiary_account: "ACCT-1",
      executed_at: "2026-11-10T14:00:00.000Z",
      external_id: `txn_${caseId}`,
    });
    await ingestFeedBody(pool, ORG, feed.feed_id, body, "json");

    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      created_by: "test",
      signingKey: signingKey(),
    });

    expect(result.report.matched_count).toBe(1);
    expect(result.report.exception_count).toBe(0);
    expect(result.report.report_receipt_id).toBeTruthy();
    expect(result.report.report_receipt_hash).toMatch(/^sha256:/);
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G2");
  });

  it("rerun is idempotent (same fingerprints, no duplicate exceptions)", async () => {
    const pool = getPool();
    const caseId = `LN-IDEM-${randomUUID().slice(0, 8)}`;
    await seedCase({ caseId, amount: "100", beneficiary: "B1" });
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Idem feed ${caseId}`,
      match_key: "case_id",
    });
    // Feed amount differs → amount_mismatch
    await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: caseId,
        amount: "999",
        beneficiary_account: "B1",
        executed_at: "2026-11-10T14:00:00.000Z",
        external_id: `txn_${caseId}`,
      }),
      "json",
    );

    const first = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    const mismatch = first.exceptions.filter((e) => e.kind === "amount_mismatch");
    expect(mismatch.length).toBe(1);
    const id = mismatch[0]!.exception_id;

    const second = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    const again = second.exceptions.filter((e) => e.kind === "amount_mismatch");
    expect(again).toHaveLength(1);
    expect(again[0]!.exception_id).toBe(id);

    const all = await listExceptions(pool, ORG, { status: "all", limit: 1000 });
    expect(
      all.filter(
        (e) => e.kind === "amount_mismatch" && e.case_id === caseId,
      ),
    ).toHaveLength(1);
  });

  it("feed row edited after the fact is detected on next run", async () => {
    const pool = getPool();
    const caseId = `LN-EDIT-${randomUUID().slice(0, 8)}`;
    await seedCase({ caseId, amount: "500000", beneficiary: "ACCT-E" });
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Edit feed ${caseId}`,
      match_key: "case_id",
    });

    await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: caseId,
        amount: "500000",
        beneficiary_account: "ACCT-E",
        executed_at: "2026-11-10T14:00:00.000Z",
        external_id: `txn_${caseId}`,
      }),
      "json",
    );

    const clean = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(clean.report.matched_count).toBe(1);
    expect(
      clean.exceptions.filter((e) => e.kind === "amount_mismatch"),
    ).toHaveLength(0);

    const edited = await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: caseId,
        amount: "500001",
        beneficiary_account: "ACCT-E",
        executed_at: "2026-11-10T14:00:00.000Z",
        external_id: `txn_${caseId}`,
      }),
      "json",
    );
    expect(edited.edited).toBe(1);

    const next = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(
      next.exceptions.some(
        (e) => e.kind === "amount_mismatch" && e.case_id === caseId,
      ),
    ).toBe(true);
  });

  it("executed_without_receipt", async () => {
    const pool = getPool();
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Bypass ${randomUUID().slice(0, 6)}`,
      match_key: "case_id",
    });
    const ghost = `LN-GHOST-${randomUUID().slice(0, 6)}`;
    await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: ghost,
        amount: "10",
        beneficiary_account: "X",
        executed_at: "2026-11-10T14:00:00.000Z",
        external_id: `txn_${ghost}`,
      }),
      "json",
    );
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(
      result.exceptions.some(
        (e) =>
          e.kind === "executed_without_receipt" && e.case_id === ghost,
      ),
    ).toBe(true);
  });

  it("receipt_without_execution", async () => {
    const pool = getPool();
    const caseId = `LN-NOEXEC-${randomUUID().slice(0, 6)}`;
    await seedCase({ caseId });
    // Org-wide run (no feed_id): approved case with no feed row anywhere.
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(
      result.exceptions.some(
        (e) =>
          e.kind === "receipt_without_execution" && e.case_id === caseId,
      ),
    ).toBe(true);
  });

  it("beneficiary_mismatch", async () => {
    const pool = getPool();
    const caseId = `LN-BENE-${randomUUID().slice(0, 6)}`;
    await seedCase({ caseId, beneficiary: "ACCT-GOOD" });
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Bene ${caseId}`,
      match_key: "case_id",
    });
    await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: caseId,
        amount: "1000000",
        beneficiary_account: "ACCT-BAD",
        executed_at: "2026-11-10T14:00:00.000Z",
        external_id: `txn_${caseId}`,
      }),
      "json",
    );
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(
      result.exceptions.some((e) => e.kind === "beneficiary_mismatch"),
    ).toBe(true);
  });

  it("executed_after_stop", async () => {
    const pool = getPool();
    const caseId = `LN-STOP-${randomUUID().slice(0, 6)}`;
    await seedCase({
      caseId,
      outcome: "stop",
      status: "stopped",
      amount: "100",
      beneficiary: "S1",
    });
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Stop ${caseId}`,
      match_key: "case_id",
    });
    await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: caseId,
        amount: "100",
        beneficiary_account: "S1",
        executed_at: "2026-11-10T16:00:00.000Z",
        external_id: `txn_${caseId}`,
      }),
      "json",
    );
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(
      result.exceptions.some((e) => e.kind === "executed_after_stop"),
    ).toBe(true);
  });

  it("executed_after_expiry", async () => {
    const pool = getPool();
    const caseId = `LN-EXP-${randomUUID().slice(0, 6)}`;
    await seedCase({
      caseId,
      amount: "100",
      beneficiary: "E1",
      tokenExpiresAt: "2026-11-10T13:00:00.000Z",
    });
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Exp ${caseId}`,
      match_key: "case_id",
    });
    await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: caseId,
        amount: "100",
        beneficiary_account: "E1",
        executed_at: "2026-11-10T18:00:00.000Z",
        external_id: `txn_${caseId}`,
      }),
      "json",
    );
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(
      result.exceptions.some((e) => e.kind === "executed_after_expiry"),
    ).toBe(true);
  });

  it("approver_same_as_requester", async () => {
    const pool = getPool();
    const caseId = `LN-SAME-${randomUUID().slice(0, 6)}`;
    await seedCase({
      caseId,
      requester: "same@bank.test",
      approver: "same@bank.test",
    });
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Same ${caseId}`,
      match_key: "case_id",
    });
    await ingestFeedBody(
      pool,
      ORG,
      feed.feed_id,
      JSON.stringify({
        case_id: caseId,
        amount: "1000000",
        beneficiary_account: "ACCT-OK",
        executed_at: "2026-11-10T14:00:00.000Z",
        external_id: `txn_${caseId}`,
      }),
      "json",
    );
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(
      result.exceptions.some((e) => e.kind === "approver_same_as_requester"),
    ).toBe(true);
  });

  it("sequence_gap", async () => {
    const pool = getPool();
    const sourceId = `src_gap_${randomUUID().slice(0, 6)}`;
    await pool.query(
      `INSERT INTO source (source_id, organization_id, name, kind, status, last_seq)
       VALUES ($1,$2,'Gap source','application','active',5)
       ON CONFLICT DO NOTHING`,
      [sourceId, ORG],
    );
    await pool.query(
      `INSERT INTO source_sequence_gap (organization_id, source_id, from_seq, to_seq, detected_at)
       VALUES ($1,$2,2,4,'2026-11-10T12:00:00.000Z')
       ON CONFLICT DO NOTHING`,
      [ORG, sourceId],
    );
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Gap feed ${sourceId}`,
      match_key: "case_id",
      source_id: sourceId,
    });
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
    });
    expect(result.exceptions.some((e) => e.kind === "sequence_gap")).toBe(true);
  });

  it("source_silent", async () => {
    const pool = getPool();
    const sourceId = `src_silent_${randomUUID().slice(0, 6)}`;
    await pool.query(
      `INSERT INTO source (
         source_id, organization_id, name, kind, status, last_seq,
         last_event_at, expected_interval_sec
       ) VALUES ($1,$2,'Silent','application','active',1,
         '2026-11-01T00:00:00.000Z', 3600)
       ON CONFLICT (organization_id, source_id) DO UPDATE
         SET last_event_at = EXCLUDED.last_event_at,
             expected_interval_sec = EXCLUDED.expected_interval_sec`,
      [sourceId, ORG],
    );
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Silent feed ${sourceId}`,
      match_key: "case_id",
      source_id: sourceId,
      expected_interval_sec: 3600,
    });
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
      now: new Date("2026-11-18T12:00:00.000Z"),
    });
    expect(result.exceptions.some((e) => e.kind === "source_silent")).toBe(true);
  });

  it("below_required_grade_past_deadline", async () => {
    const pool = getPool();
    const caseId = `LN-GRADE-${randomUUID().slice(0, 6)}`;
    const workflowId = `wf_grade_${randomUUID().slice(0, 6)}`;
    await pool.query(
      `INSERT INTO governed_workflow (
         workflow_id, organization_id, name, description, record_only, execution_config
       ) VALUES ($1,$2,'Grade wf','test',false,$3::jsonb)
       ON CONFLICT (workflow_id) DO UPDATE SET execution_config = EXCLUDED.execution_config`,
      [
        workflowId,
        ORG,
        JSON.stringify({
          required_grade: "G2",
          on_missing: "exception",
          grade_deadline_hours: 1,
        }),
      ],
    );
    await seedCase({
      caseId,
      workflowId,
      createdAt: "2026-11-10T00:00:00.000Z",
      withToken: false,
    });
    const feed = await createFeed(pool, {
      organization_id: ORG,
      name: `Grade feed ${caseId}`,
      match_key: "case_id",
    });
    // No matching feed row → stays below G2; deadline long past.
    const result = await runReconciliation(pool, {
      organization_id: ORG,
      feed_id: feed.feed_id,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      trigger: "on_demand",
      signingKey: signingKey(),
      now: new Date("2026-11-18T12:00:00.000Z"),
    });
    expect(
      result.exceptions.some(
        (e) =>
          e.kind === "below_required_grade_past_deadline" &&
          e.case_id === caseId,
      ),
    ).toBe(true);
  });

  it("stub kinds db_change_without_event and plausibility_flag can be raised manually", async () => {
    const pool = getPool();
    const a = await raiseManualException(pool, {
      organization_id: ORG,
      kind: "db_change_without_event",
      case_id: "LN-STUB-DB",
      fingerprint_key: "stub-db",
      detail: { stage: 6 },
    });
    const b = await raiseManualException(pool, {
      organization_id: ORG,
      kind: "plausibility_flag",
      case_id: "LN-STUB-PL",
      fingerprint_key: "stub-pl",
      detail: { stage: 7 },
    });
    expect(a.kind).toBe("db_change_without_event");
    expect(b.kind).toBe("plausibility_flag");
    expect(RECONCILIATION_EXCEPTION_KINDS).toContain("db_change_without_event");
    expect(RECONCILIATION_EXCEPTION_KINDS).toContain("plausibility_flag");
  });

  it("acknowledge and resolve record notes", async () => {
    const pool = getPool();
    const raised = await raiseManualException(pool, {
      organization_id: ORG,
      kind: "plausibility_flag",
      case_id: "LN-NOTE-1",
      fingerprint_key: `note-${randomUUID().slice(0, 6)}`,
    });
    const ack = await acknowledgeException(
      pool,
      ORG,
      raised.exception_id,
      "Looking into it",
      "auditor@test",
    );
    expect(ack.status).toBe("acknowledged");
    expect(ack.acknowledge_note).toBe("Looking into it");
    const resolved = await resolveException(
      pool,
      ORG,
      raised.exception_id,
      "False positive",
      "auditor@test",
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolve_note).toBe("False positive");
  });
});
