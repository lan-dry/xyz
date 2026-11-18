/**
 * Stage 3: decision token issue + executor confirm.
 * Covers match, field mismatch naming, reuse, expired, stopped, tampered,
 * wrong tenant, concurrent one-wins, offline agrees, allow_and_flag vs block,
 * break-glass.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import {
  checkToken,
  paramsHash,
  resolveOnAegisUnavailable,
  type DecisionToken,
} from "@salanor/aegis-sdk";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { issueForensicReceipt } from "../src/forensic/issue.js";
import { confirmExecution } from "../src/execution/confirm.js";
import { issueDecisionToken } from "../src/execution/decision-token.js";
import {
  DEFAULT_EXECUTABLE_PARAMS,
  type WorkflowExecutionConfig,
} from "../src/execution/workflow-config.js";
import { publishReceiptSigningKey } from "../src/repo/receipt-keys.js";
import { resolveReceiptSigning } from "../src/crypto/receipt-signing.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
  INTEGRATION_ORG_B,
} from "./integration-fixture.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const ORG_B = INTEGRATION_ORG_B;
const KEY_ID = "receipt_token_test";

const BASE_PARAMS = {
  amount: "1500000",
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

describeIfDb("decision token + executor confirm (Stage 3)", () => {
  let privateKeyB64: string;
  let publicKeyB64: string;
  const signingKey = () => ({ key_id: KEY_ID, private_key_b64: privateKeyB64 });

  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    await pool.query(
      `INSERT INTO organization (organization_id, name, slug)
       VALUES ($1, 'Org B token test', 'org-b-token-test')
       ON CONFLICT (organization_id) DO NOTHING`,
      [ORG_B],
    );
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
    ttl_sec?: number;
    orgId?: string;
    now?: Date;
  }): Promise<{ token: DecisionToken; caseId: string }> {
    const caseId = opts?.caseId ?? `LN-${randomUUID().slice(0, 8)}`;
    const orgId = opts?.orgId ?? ORG;
    if (orgId === ORG) {
      await seedAllowCase(caseId);
    } else {
      await getPool().query(
        `INSERT INTO bank_case (
           case_id, organization_id, idempotency_key, status, outcome, mode
         ) VALUES ($1, $2, $3, 'approved', 'allow', 'enforce')
         ON CONFLICT (organization_id, case_id) DO NOTHING`,
        [caseId, orgId, `idem_${caseId}`],
      );
    }
    const config = {
      ...EXEC_CONFIG,
      ...(opts?.ttl_sec ? { token_ttl_sec: opts.ttl_sec } : {}),
    };
    const token = await issueDecisionToken(getPool(), {
      organizationId: orgId,
      caseId,
      decisionId: `dec_${caseId}`,
      attributes: opts?.params ?? BASE_PARAMS,
      config,
      signingKey: signingKey(),
      now: opts?.now,
    });
    expect(token).not.toBeNull();
    return { token: token!, caseId };
  }

  it("match passes", async () => {
    const { token, caseId } = await issueToken();
    const result = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(result).toMatchObject({
      ok: true,
      code: "matched",
      case_id: caseId,
      plain_summary: "Executed: parameters hash matched token",
    });
  });

  it.each([
    ["amount", { ...BASE_PARAMS, amount: "999" }],
    ["currency", { ...BASE_PARAMS, currency: "USD" }],
    ["beneficiary_account", { ...BASE_PARAMS, beneficiary_account: "ACCT-OTHER" }],
    ["product", { ...BASE_PARAMS, product: "other_product" }],
  ] as const)("field mismatch names %s", async (field, badParams) => {
    const { token } = await issueToken();
    const result = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: badParams,
      signingKey: signingKey(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("params_mismatch");
      expect(result.mismatched_fields?.map((m) => m.field)).toContain(field);
    }
  });

  it("reuse fails", async () => {
    const { token } = await issueToken();
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
    if (!second.ok) expect(second.code).toBe("used");
  });

  it("expired fails", async () => {
    const now = new Date("2026-11-18T10:00:00.000Z");
    const { token } = await issueToken({ ttl_sec: 60, now });
    const result = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: BASE_PARAMS,
      signingKey: signingKey(),
      now: new Date("2026-11-18T10:05:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("expired");
  });

  it("stopped case fails", async () => {
    const caseId = `LN-stop-${randomUUID().slice(0, 6)}`;
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

  it("tampered token fails", async () => {
    const { token } = await issueToken();
    const tampered = { ...token, case_id: "tampered-case" };
    const result = await confirmExecution(getPool(), {
      organizationId: ORG,
      token: tampered,
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("bad_signature");
  });

  it("wrong tenant fails", async () => {
    const { token } = await issueToken({ orgId: ORG_B });
    const result = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("wrong_tenant");
  });

  it("concurrent confirms: exactly one wins", async () => {
    const { token } = await issueToken();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        confirmExecution(getPool(), {
          organizationId: ORG,
          token,
          params: BASE_PARAMS,
          signingKey: signingKey(),
        }),
      ),
    );
    const wins = results.filter((r) => r.ok);
    const losses = results.filter((r) => !r.ok);
    expect(wins).toHaveLength(1);
    expect(losses.length).toBe(7);
    for (const loss of losses) {
      if (!loss.ok) expect(loss.code).toBe("used");
    }
  });

  it("offline checkToken agrees with online confirm", async () => {
    const { token } = await issueToken();
    const offlineOk = await checkToken(token, BASE_PARAMS, publicKeyB64);
    expect(offlineOk).toEqual({
      ok: true,
      params_hash: paramsHash(BASE_PARAMS),
    });
    const offlineBad = await checkToken(
      token,
      { ...BASE_PARAMS, amount: "1" },
      publicKeyB64,
      { authorisedParams: BASE_PARAMS },
    );
    expect(offlineBad.ok).toBe(false);

    const onlineOk = await confirmExecution(getPool(), {
      organizationId: ORG,
      token,
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(onlineOk.ok).toBe(true);
  });

  it("allow_and_flag vs block when Aegis was unavailable", async () => {
    expect(resolveOnAegisUnavailable("allow_and_flag")).toEqual({
      proceed: true,
      flag: true,
      policy: "allow_and_flag",
    });
    expect(resolveOnAegisUnavailable("block")).toEqual({
      proceed: false,
      flag: false,
      policy: "block",
    });

    const caseId = `LN-flag-${randomUUID().slice(0, 6)}`;
    await seedAllowCase(caseId);
    await getPool().query(
      `INSERT INTO governed_workflow (
         workflow_id, organization_id, name, record_only, execution_config
       ) VALUES ($1, $2, 'block wf', false, $3::jsonb)
       ON CONFLICT (workflow_id) DO UPDATE SET execution_config = EXCLUDED.execution_config`,
      [
        `wf_block_${caseId}`,
        ORG,
        JSON.stringify({
          ...EXEC_CONFIG,
          on_aegis_unavailable: "block",
          product: "retail_loan",
        }),
      ],
    );
    await getPool().query(
      `UPDATE bank_case SET workflow_id = $3
       WHERE organization_id = $1 AND case_id = $2`,
      [ORG, caseId, `wf_block_${caseId}`],
    );

    const blocked = await confirmExecution(getPool(), {
      organizationId: ORG,
      case_id: caseId,
      flagged_unavailable: true,
      params: BASE_PARAMS,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("blocked_unavailable");
      expect(blocked.on_aegis_unavailable).toBe("block");
    }

    const caseAllow = `LN-allowflag-${randomUUID().slice(0, 6)}`;
    await seedAllowCase(caseAllow);
    const flagged = await confirmExecution(getPool(), {
      organizationId: ORG,
      case_id: caseAllow,
      flagged_unavailable: true,
      params: BASE_PARAMS,
      reason: "core could not reach Aegis",
    });
    expect(flagged).toMatchObject({
      ok: true,
      code: "allow_and_flag",
    });
    if (flagged.ok) expect(flagged.exception_id).toMatch(/^exc_/);
  });

  it("break-glass requires reason and records an exception", async () => {
    const caseId = `LN-bg-${randomUUID().slice(0, 6)}`;
    await seedAllowCase(caseId);
    const missing = await confirmExecution(getPool(), {
      organizationId: ORG,
      break_glass: true,
      case_id: caseId,
      params: BASE_PARAMS,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("missing_reason");

    const ok = await confirmExecution(getPool(), {
      organizationId: ORG,
      break_glass: true,
      case_id: caseId,
      reason: "Payment rail timeout; treasury authorised manual release",
      params: BASE_PARAMS,
      signingKey: signingKey(),
    });
    expect(ok).toMatchObject({
      ok: true,
      code: "break_glass",
      case_id: caseId,
    });
    if (ok.ok) {
      expect(ok.exception_id).toMatch(/^exc_/);
      const row = await getPool().query(
        `SELECT kind, reason FROM execution_exception WHERE exception_id = $1`,
        [ok.exception_id],
      );
      expect(row.rows[0]).toMatchObject({
        kind: "break_glass",
        reason: "Payment rail timeout; treasury authorised manual release",
      });
    }
  });
});
