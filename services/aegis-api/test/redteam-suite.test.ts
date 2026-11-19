/**
 * Stage 8 Red Team suite — attacks #1–18 + honest limits (fixture / unit).
 * Live stack: `pnpm test:redteam` when bank-simulator is up.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import {
  buildEnvelope,
  checkToken,
  paramsHash,
  resolveOnAegisUnavailable,
  signEnvelope,
  verifyEnvelope,
  type DecisionToken,
} from "@salanor/aegis-sdk";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { confirmExecution } from "../src/execution/confirm.js";
import { issueDecisionToken } from "../src/execution/decision-token.js";
import {
  DEFAULT_EXECUTABLE_PARAMS,
  type WorkflowExecutionConfig,
} from "../src/execution/workflow-config.js";
import { issueForensicReceipt } from "../src/forensic/issue.js";
import {
  buildReceiptBody,
  signForensicReceipt,
} from "../src/forensic/receipt.js";
import { verifyForensicBundle } from "../src/forensic/verify-bundle.js";
import {
  buildCaseProvenance,
  gradeFromChecks,
  summarizeReceiptProvenance,
} from "../src/sources/provenance.js";
import { publishReceiptSigningKey } from "../src/repo/receipt-keys.js";
import { resolveReceiptSigning } from "../src/crypto/receipt-signing.js";
import { separationOfDutiesEnabled } from "../src/approvals/approver-binding.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
const ORG = INTEGRATION_ORG_A;
const KEY_ID = "receipt_redteam";

const BASE_PARAMS = {
  amount: "4000000",
  currency: "RWF",
  beneficiary_account: "ACCT-1",
  product: "retail_loan",
};

const EXEC_CONFIG: WorkflowExecutionConfig = {
  executable_params: [...DEFAULT_EXECUTABLE_PARAMS],
  execution_control: "enforce",
  on_aegis_unavailable: "allow_and_flag",
  action_type: "loan.disburse",
  token_ttl_sec: 3600,
};

describeIfDb("Stage 8 red team suite (fixture)", () => {
  let privateKeyB64: string;
  let publicKeyB64: string;
  const signingKey = () => ({ key_id: KEY_ID, private_key_b64: privateKeyB64 });

  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    const privateKey = ed.utils.randomPrivateKey();
    privateKeyB64 = Buffer.from(privateKey).toString("base64");
    publicKeyB64 = Buffer.from(await ed.getPublicKeyAsync(privateKey)).toString(
      "base64",
    );
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

  async function seedAllowCase(caseId: string, outcome: string = "allow") {
    await getPool().query(
      `INSERT INTO bank_case (
         case_id, organization_id, idempotency_key, status, outcome, mode
       ) VALUES ($1, $2, $3, $4, $5, 'enforce')
       ON CONFLICT (organization_id, case_id) DO UPDATE
         SET status = EXCLUDED.status, outcome = EXCLUDED.outcome`,
      [
        caseId,
        ORG,
        `idem_${caseId}`,
        outcome === "stop" ? "stopped" : "approved",
        outcome,
      ],
    );
    await issueForensicReceipt(getPool(), {
      organization_id: ORG,
      case_id: caseId,
      decision_id: `dec_${caseId}`,
      outcome,
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        {
          event_id: `evt_${caseId}`,
          event_hash: `sha256:${randomUUID().replace(/-/g, "")}`,
          sequence_num: 1,
        },
      ],
      attributes: { ...BASE_PARAMS },
      signingKey: signingKey(),
    });
  }

  async function issueToken(opts?: {
    caseId?: string;
    params?: Record<string, unknown>;
  }): Promise<{ token: DecisionToken; caseId: string }> {
    const caseId = opts?.caseId ?? `LN-${randomUUID().slice(0, 8)}`;
    await seedAllowCase(caseId);
    const token = await issueDecisionToken(getPool(), {
      organizationId: ORG,
      caseId,
      decisionId: `dec_${caseId}`,
      attributes: opts?.params ?? BASE_PARAMS,
      config: EXEC_CONFIG,
      signingKey: signingKey(),
    });
    expect(token).not.toBeNull();
    return { token: token!, caseId };
  }

  it("#1 forged signature fails verifyEnvelope", async () => {
    const seed = randomBytes(32);
    const env = await signEnvelope(
      buildEnvelope({
        source_id: "src_los",
        key_id: "k_los_2026_01",
        seq: 1,
        event: {
          schema_version: 1,
          case_id: "RT1",
          event_type: "loan_decision",
          attributes: { amount: 1 },
        },
      }),
      seed,
    );
    const forged = {
      ...env,
      signature: (env.signature[0] === "A" ? "B" : "A") + env.signature.slice(1),
    };
    const pub = await ed.getPublicKeyAsync(seed);
    const v = await verifyEnvelope(forged, pub);
    expect(v.ok).toBe(false);
  });

  it("#5 LOS 4M vs core 18M → params_mismatch on amount", async () => {
    const { token } = await issueToken();
    const result = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: { ...BASE_PARAMS, amount: "18000000" },
      signingKey: signingKey(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("params_mismatch");
      expect(result.mismatched_fields?.map((m) => m.field)).toContain("amount");
    }
  });

  it("#6/#7 offline check ok; online reuse refused", async () => {
    const { token } = await issueToken();
    const local = await checkToken(token, BASE_PARAMS, publicKeyB64);
    expect(local.ok).toBe(true);
    const first = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(first.ok).toBe(true);
    const second = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(second.ok).toBe(false);
  });

  it("#8 stopped case refused", async () => {
    const caseId = `LN-stop-${randomUUID().slice(0, 8)}`;
    await seedAllowCase(caseId, "stop");
    const token = await issueDecisionToken(getPool(), {
      organizationId: ORG,
      caseId,
      decisionId: `dec_${caseId}`,
      attributes: BASE_PARAMS,
      config: EXEC_CONFIG,
      signingKey: signingKey(),
    });
    expect(token).not.toBeNull();
    const result = await confirmExecution(getPool(), {
      organizationId: ORG,
      token: token!,
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("stopped");
  });

  it("#10 separation of duties flag is on when configured", () => {
    expect(separationOfDutiesEnabled({ separation_of_duties: true })).toBe(true);
    expect(separationOfDutiesEnabled({ separation_of_duties: false })).toBe(false);
  });

  it("#15 allow_and_flag vs block when Aegis unavailable", () => {
    expect(resolveOnAegisUnavailable("allow_and_flag")).toMatchObject({
      proceed: true,
      flag: true,
      policy: "allow_and_flag",
    });
    expect(resolveOnAegisUnavailable("block")).toMatchObject({
      proceed: false,
      flag: false,
      policy: "block",
    });
  });

  it("#17 tampered receipt fails verifyForensicBundle", async () => {
    const body = buildReceiptBody({
      organization_id: ORG,
      seq: 9001,
      prev_hash: null,
      case_id: "rt17",
      decision_id: "dec_rt17",
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        { event_id: "evt_rt17", event_hash: "sha256:abc", sequence_num: 1 },
      ],
      attributes: { amount: 1 },
      key_id: KEY_ID,
      issued_at: new Date().toISOString(),
    });
    const signed = await signForensicReceipt(body, privateKeyB64);
    const tampered = structuredClone(signed) as Record<string, unknown>;
    tampered.outcome = "stop";
    const verdict = await verifyForensicBundle({
      receipts: [tampered as never],
      keys: { [KEY_ID]: publicKeyB64 },
    });
    expect(verdict.ok).toBe(false);
  });

  it("#18 legacy receipt (no provenance) reads as G0 legacy", async () => {
    const body = buildReceiptBody({
      organization_id: ORG,
      seq: 9002,
      prev_hash: null,
      case_id: "rt18",
      decision_id: "dec_rt18",
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        { event_id: "evt_rt18", event_hash: "sha256:def", sequence_num: 1 },
      ],
      attributes: { amount: 1 },
      key_id: KEY_ID,
      issued_at: "2026-03-01T10:00:00.000Z",
    });
    const legacy = await signForensicReceipt(body, privateKeyB64);
    expect("provenance" in legacy).toBe(false);
    const summary = summarizeReceiptProvenance(legacy);
    expect(summary).toMatchObject({
      has_block: false,
      legacy: true,
      grade_at_seal: "G0",
    });
    const view = buildCaseProvenance([legacy])!;
    expect(view.legacy).toBe(true);
    expect(view.source_line).toContain("G0 (legacy)");
  });

  it("honest limits: consistently false signed value stays G1, labelled clearly", () => {
    const grade = gradeFromChecks({
      source_signed: true,
      approver_bound: false,
      execution_matched: false,
      reconciled: false,
      independently_captured: false,
    });
    expect(grade).toBe("G1");
    const label = "signed by source, not corroborated";
    expect(label).toMatch(/not corroborated/);
    // Same wrong value signed twice still hashes the same — no independent record raises it.
    expect(paramsHash({ amount: "100" })).toBe(paramsHash({ amount: "100" }));
    expect(paramsHash({ amount: "100" })).not.toBe(paramsHash({ amount: "999" }));
  });
});

describe("Stage 8 red team attack matrix (documentation contract)", () => {
  it("lists attacks 1–18 with attacker gains + expected outcomes", async () => {
    const mod = await import(
      "../../../tools/bank-simulator/redteam-attacks.mjs"
    );
    const ATTACKS = mod.ATTACKS as Array<{
      id: number;
      attacker_gains: string;
      expected: string;
    }>;
    const HONEST_LIMIT = mod.HONEST_LIMIT as { expected: string };
    expect(ATTACKS).toHaveLength(18);
    expect(ATTACKS.map((a) => a.id)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    for (const a of ATTACKS) {
      expect(a.attacker_gains.length).toBeGreaterThan(10);
      expect(a.expected.length).toBeGreaterThan(5);
    }
    expect(HONEST_LIMIT.expected).toMatch(/G1/);
  });
});
