/**
 * Stage 7: third-party signed facts + fact_mismatch.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildEnvelope,
  generateKeyPair,
  signEnvelope,
} from "@salanor/aegis-sdk";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { registerSource } from "../src/sources/registry.js";
import {
  applySignedOverrides,
  fieldsFromThirdPartyEvent,
  formatSignedFactLine,
  resolveThirdPartyFacts,
} from "../src/sources/third-party-facts.js";
import { evaluateBankEvent } from "../src/bank/evaluate.js";
import { listExceptions } from "../src/reconciliation/exceptions.js";
import { handleBankEvent } from "../src/bank/handle-event.js";
import { publishReceiptSigningKey } from "../src/repo/receipt-keys.js";
import { resolveReceiptSigning } from "../src/crypto/receipt-signing.js";
import * as ed from "@noble/ed25519";
import { randomUUID } from "node:crypto";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import { buildCaseProvenance } from "../src/sources/provenance.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
const ORG = INTEGRATION_ORG_A;

describe("third-party fact helpers (pure)", () => {
  it("formats the case-page credit score line", () => {
    expect(formatSignedFactLine("credit_score", 612, "Demo Credit Bureau")).toBe(
      "Credit score 612, signed by Demo Credit Bureau",
    );
  });

  it("reads fields from bureau event payloads", () => {
    expect(
      fieldsFromThirdPartyEvent({
        type: "credit_bureau.response",
        fields: { credit_score: 612 },
      }),
    ).toEqual({ credit_score: 612 });
  });

  it("applies signed overrides for policy evaluation", () => {
    expect(
      applySignedOverrides({ credit_score: 900, amount: "1" }, { credit_score: 612 }),
    ).toEqual({ credit_score: 612, amount: "1" });
  });

  it("policy evaluates the signed score, not the LOS assertion", () => {
    const result = evaluateBankEvent({
      policy_id: "pol_test",
      combine: "top_priority",
      tool_name: "governed.action",
      attributes: applySignedOverrides(
        { credit_score: 900, amount: 1_000_000 },
        { credit_score: 612 },
      ),
      rules: [
        {
          rule_id: "R-SCORE",
          tool_pattern: "governed.action",
          decision: "deny",
          priority: 10,
          policy_id: "pol_test",
          conditions: {
            expr: { lt: ["credit_score", 650] },
          },
        },
      ],
    });
    expect(result.outcome).toBe("stop");
    expect(result.matched_rules.some((m) => m.rule_id === "R-SCORE")).toBe(true);
  });
});

describeIfDb("third-party signed facts (Stage 7)", () => {
  let bureauPrivateB64: string;
  let bureauPublicB64: string;
  let receiptPrivateB64: string;

  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);

    const bureau = await generateKeyPair();
    bureauPrivateB64 = bureau.privateKeyB64;
    bureauPublicB64 = bureau.publicKeyB64;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await registerSource(client, {
        organization_id: ORG,
        source_id: "src_demo_bureau",
        name: "Demo Credit Bureau",
        kind: "third_party",
        key_id: "k_bureau_demo_2026",
        public_key_b64: bureauPublicB64,
        actor: "stage7-test",
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const receiptKey = ed.utils.randomPrivateKey();
    receiptPrivateB64 = Buffer.from(receiptKey).toString("base64");
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = receiptPrivateB64;
    process.env.AEGIS_RECEIPT_KEY_ID = "receipt_stage7";
    const signing = await resolveReceiptSigning({
      override: { key_id: "receipt_stage7", private_key_b64: receiptPrivateB64 },
    });
    await publishReceiptSigningKey(pool, signing);
  });

  afterAll(async () => {
    await closePool();
  });

  async function signBureauScore(score: number, seq = 1) {
    const unsigned = buildEnvelope({
      source_id: "src_demo_bureau",
      key_id: "k_bureau_demo_2026",
      seq,
      event: {
        type: "credit_bureau.response",
        fields: { credit_score: score },
      },
    });
    return signEnvelope(unsigned, bureauPrivateB64);
  }

  it("verifies a nested bureau envelope and uses the signed value", async () => {
    const pool = getPool();
    const envelope = await signBureauScore(612, 1);
    const resolved = await resolveThirdPartyFacts(pool, ORG, {
      credit_score: 612,
      third_party_facts: [envelope],
    });
    expect(resolved.rejected).toEqual([]);
    expect(resolved.mismatches).toEqual([]);
    expect(resolved.overrides.credit_score).toBe(612);
    expect(resolved.assertion_overrides.credit_score).toBe("signed_by_third_party");
    expect(resolved.signed[0]?.display_line).toBe(
      "Credit score 612, signed by Demo Credit Bureau",
    );
  });

  it("LOS score differs from signed bureau → fact_mismatch; signed value used", async () => {
    const pool = getPool();
    const envelope = await signBureauScore(612, 2);
    const caseId = `LN-FACT-${randomUUID().slice(0, 8)}`;
    const decision = await handleBankEvent(
      pool,
      ORG,
      {
        schema_version: 1,
        case_id: caseId,
        idempotency_key: randomUUID(),
        event_type: "loan_decision",
        product: "retail_loan",
        emitted_at: "2026-11-18T10:00:00.000Z",
        attributes: {
          amount: 500_000,
          currency: "RWF",
          credit_score: 780,
          third_party_facts: [envelope],
        },
      },
      { forceRecordOnly: true },
    );
    expect(decision.case_id).toBe(caseId);

    const exceptions = (await listExceptions(pool, ORG)).filter(
      (e) => e.case_id === caseId && e.kind === "fact_mismatch",
    );
    expect(exceptions.length).toBeGreaterThan(0);
    const detail = exceptions[0]?.detail as {
      asserted_value?: unknown;
      signed_value?: unknown;
      used_value?: unknown;
    };
    expect(detail?.asserted_value).toBe(780);
    expect(detail?.signed_value).toBe(612);
    expect(detail?.used_value).toBe(612);

    const rcpt = await pool.query<{ body: Record<string, unknown> }>(
      `SELECT body FROM forensic_receipt
       WHERE organization_id = $1 AND case_id = $2
       ORDER BY seq ASC LIMIT 1`,
      [ORG, caseId],
    );
    const body = rcpt.rows[0]?.body;
    expect(body).toBeTruthy();
    const attrs = (body?.attributes ?? {}) as Record<string, unknown>;
    expect(attrs.credit_score).toBe(612);
    const prov = body?.provenance as {
      field_assertions?: Record<string, string>;
    };
    expect(prov?.field_assertions?.credit_score).toBe("signed_by_third_party");
    expect(prov?.field_assertions?.amount).toBe("asserted_by_source");

    const view = buildCaseProvenance([
      {
        receipt_id: String(body?.receipt_id ?? "r1"),
        seq: 1,
        outcome: String(body?.outcome ?? "allow"),
        issued_at: String(body?.issued_at ?? "2026-11-18T10:00:00.000Z"),
        provenance: body?.provenance,
        attributes: attrs,
      },
    ]);
      expect(view?.signed_facts?.[0]?.display_line).toBe(
        "Credit score 612, signed by Demo Credit Bureau",
      );
  });

  it("rejects a nested envelope from a non-third_party source kind", async () => {
    const pool = getPool();
    const app = await generateKeyPair();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await registerSource(client, {
        organization_id: ORG,
        source_id: "src_los_not_bureau",
        name: "LOS",
        kind: "application",
        key_id: "k_los_not_bureau",
        public_key_b64: app.publicKeyB64,
        actor: "stage7-test",
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const unsigned = buildEnvelope({
      source_id: "src_los_not_bureau",
      key_id: "k_los_not_bureau",
      seq: 1,
      event: { fields: { credit_score: 700 } },
    });
    const envelope = await signEnvelope(unsigned, app.privateKeyB64);
    const resolved = await resolveThirdPartyFacts(pool, ORG, {
      third_party_facts: [envelope],
    });
    expect(resolved.signed).toEqual([]);
    expect(resolved.rejected[0]?.reason).toBe("not_third_party");
  });
});
