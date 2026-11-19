/**
 * Stage 2 (DB): grade changes are sealed receipts plus an append-only index row, grades only
 * rise, and the case summary API shows the grade at seal and the current grade.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import * as ed from "@noble/ed25519";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { issueForensicReceipt } from "../src/forensic/issue.js";
import { verifyForensicBundle } from "../src/forensic/verify-bundle.js";
import {
  GradeChangeError,
  getCurrentGrade,
  listGradeChanges,
  loadCaseProvenance,
  recordGradeChange,
} from "../src/forensic/case-provenance.js";
import {
  buildFieldAssertions,
  buildProvenanceBlock,
} from "../src/sources/provenance.js";
import { consoleRoutes } from "../src/routes/console/index.js";
import {
  applyIntegrationFixture,
  INTEGRATION_MEMBERSHIP_A,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import { insertTestAdmin } from "./insert-test-admin.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const PASSWORD = "vitest-console-pass-12";
const KEY_ID = "receipt_prov_test";

describeIfDb("provenance: grade changes and case API", () => {
  let privateKeyB64: string;
  let publicKeyB64: string;
  let adminEmail: string;
  const signingKey = () => ({ key_id: KEY_ID, private_key_b64: privateKeyB64 });

  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    const privateKey = ed.utils.randomPrivateKey();
    privateKeyB64 = Buffer.from(privateKey).toString("base64");
    publicKeyB64 = Buffer.from(await ed.getPublicKeyAsync(privateKey)).toString("base64");
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = privateKeyB64;
    process.env.AEGIS_RECEIPT_KEY_ID = KEY_ID;
    const admin = await insertTestAdmin(pool, {
      organizationId: ORG,
      membershipId: INTEGRATION_MEMBERSHIP_A,
      password: PASSWORD,
    });
    adminEmail = admin.email;
  });

  afterAll(async () => {
    await closePool();
  });

  async function sealCase(opts: { legacy?: boolean } = {}) {
    const caseId = `case_prov_${randomUUID().slice(0, 8)}`;
    const event = {
      event_id: `evt_${caseId}`,
      event_hash: `sha256:${randomUUID().replace(/-/g, "")}`,
      sequence_num: 1,
    };
    const first = await issueForensicReceipt(getPool(), {
      organization_id: ORG,
      case_id: caseId,
      decision_id: `dec_${caseId}`,
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [event],
      attributes: { amount: 250000, currency: "RWF" },
      ...(opts.legacy
        ? {}
        : {
            provenance: buildProvenanceBlock({
              source_id: "ingest_key:ik_test",
              source_name: "Demo Core Banking",
              authentication: "bearer_key",
              field_assertions: buildFieldAssertions(["amount", "currency"]),
              recorded_at: new Date().toISOString(),
            }),
          }),
      signingKey: signingKey(),
    });
    return { caseId, event, first };
  }

  it("raises the grade with a sealed receipt and an index row; the seal-time grade stays", async () => {
    const pool = getPool();
    const { caseId, event, first } = await sealCase();

    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G0");

    const change = await recordGradeChange(pool, {
      organization_id: ORG,
      case_id: caseId,
      to_grade: "G2",
      reason: "Matched the settlement file from the processor",
      feed_name: "Processor settlement file",
      signingKey: signingKey(),
    });
    expect(change.from_grade).toBe("G0");
    expect(change.to_grade).toBe("G2");
    expect(change.receipt.outcome).toBe("grade_change");

    // The change is a sealed receipt the verifier accepts, next to the original receipt.
    const verdict = await verifyForensicBundle({
      receipts: [first, change.receipt],
      sealed_events: [event],
      keys: { [KEY_ID]: publicKeyB64 },
      subset: true,
    });
    expect(verdict.findings).toEqual([]);
    expect(verdict.ok).toBe(true);

    // The index table mirrors the sealed receipt.
    const rows = await listGradeChanges(pool, ORG, caseId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      from_grade: "G0",
      to_grade: "G2",
      feed_name: "Processor settlement file",
      receipt_id: change.receipt.receipt_id,
      receipt_hash: change.receipt.receipt_hash,
    });

    // Derived from sealed receipts: current grade rises, grade at seal does not.
    const view = (await loadCaseProvenance(pool, ORG, [caseId])).get(caseId)!;
    expect(view.grade_at_seal).toBe("G0");
    expect(view.current_grade).toBe("G2");
    expect(view.grade_changes).toHaveLength(1);
    expect(first.provenance?.grade_at_seal).toBe("G0");

    // The index is append-only.
    await expect(
      pool.query(`UPDATE evidence_grade_change SET to_grade = 'G3' WHERE case_id = $1`, [caseId]),
    ).rejects.toThrow();
    await expect(
      pool.query(`DELETE FROM evidence_grade_change WHERE case_id = $1`, [caseId]),
    ).rejects.toThrow();
  });

  it("only lets a grade rise, with a reason, from the grade the case is at", async () => {
    const pool = getPool();
    const { caseId } = await sealCase();
    const expectCode = async (
      promise: Promise<unknown>,
      code: GradeChangeError["code"],
    ) => {
      const err = await promise.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(GradeChangeError);
      expect((err as GradeChangeError).code).toBe(code);
    };

    // Same grade is not a rise.
    await expectCode(
      recordGradeChange(pool, {
        organization_id: ORG,
        case_id: caseId,
        to_grade: "G0",
        reason: "no change",
        signingKey: signingKey(),
      }),
      "grade_must_rise",
    );
    // A reason is required.
    await expectCode(
      recordGradeChange(pool, {
        organization_id: ORG,
        case_id: caseId,
        to_grade: "G2",
        reason: "   ",
        signingKey: signingKey(),
      }),
      "reason_required",
    );
    // G1 needs a source signature; a bearer-key case cannot be raised to it by assertion.
    await expectCode(
      recordGradeChange(pool, {
        organization_id: ORG,
        case_id: caseId,
        to_grade: "G1",
        reason: "trust me",
        signingKey: signingKey(),
      }),
      "checks_do_not_support_grade",
    );
    // A stale caller is refused.
    await expectCode(
      recordGradeChange(pool, {
        organization_id: ORG,
        case_id: caseId,
        to_grade: "G2",
        from_grade: "G1",
        reason: "stale",
        signingKey: signingKey(),
      }),
      "from_grade_mismatch",
    );
    // Unknown case.
    await expectCode(
      recordGradeChange(pool, {
        organization_id: ORG,
        case_id: "case_does_not_exist",
        to_grade: "G2",
        reason: "none",
        signingKey: signingKey(),
      }),
      "case_not_found",
    );
    expect(await listGradeChanges(pool, ORG, caseId)).toHaveLength(0);

    // Once raised to G2, going back down or sideways is refused.
    await recordGradeChange(pool, {
      organization_id: ORG,
      case_id: caseId,
      to_grade: "G2",
      reason: "Reconciled with the ledger",
      signingKey: signingKey(),
    });
    await expectCode(
      recordGradeChange(pool, {
        organization_id: ORG,
        case_id: caseId,
        to_grade: "G2",
        reason: "again",
        signingKey: signingKey(),
      }),
      "grade_must_rise",
    );
    expect(await getCurrentGrade(pool, ORG, caseId)).toBe("G2");
  });

  it("the case summary API shows seal-time and current grade, and legacy G0", async () => {
    const pool = getPool();
    const app = new Hono();
    app.route("/v1/console", consoleRoutes);

    const login = await app.request("/v1/console/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: PASSWORD }),
    });
    expect(login.status).toBe(200);
    const cookie = /aegis_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")![1]!;

    const stage2 = await sealCase();
    const legacy = await sealCase({ legacy: true });
    const traces = { [stage2.caseId]: `trc_${stage2.caseId}`, [legacy.caseId]: `trc_${legacy.caseId}` };
    for (const [caseId, traceId] of Object.entries(traces)) {
      await pool.query(
        `INSERT INTO bank_case (case_id, organization_id, trace_id, outcome, mode, attributes)
         VALUES ($1, $2, $3, 'allow', 'enforce', '{"amount": 250000, "currency": "RWF"}'::jsonb)`,
        [caseId, ORG, traceId],
      );
    }

    const fetchSummary = async () => {
      const res = await app.request(
        `/v1/console/cases/summary?trace_ids=${Object.values(traces).join(",")}`,
        { headers: { Cookie: `aegis_session=${cookie}` } },
      );
      expect(res.status).toBe(200);
      return (await res.json()) as {
        cases: Record<
          string,
          {
            provenance: null | {
              legacy: boolean;
              grade_at_seal: string;
              current_grade: string;
              record_line: string;
              source_line: string;
              source: null | { source_name: string; authentication: string };
              checklist: Array<{ id: string; met: boolean }>;
            };
          }
        >;
      };
    };

    const before = await fetchSummary();
    const s2 = before.cases[traces[stage2.caseId]!]!.provenance!;
    expect(s2.legacy).toBe(false);
    expect(s2.grade_at_seal).toBe("G0");
    expect(s2.current_grade).toBe("G0"); // shown even though nothing has changed
    expect(s2.source?.source_name).toBe("Demo Core Banking");
    expect(s2.source?.authentication).toBe("bearer_key");
    expect(s2.record_line).toMatch(/^Record intact: signed and unchanged since /);
    expect(s2.source_line).toContain("does not check that the data is accurate");
    expect(s2.checklist.map((c) => c.id)).toEqual([
      "source_signed",
      "approver_bound",
      "execution_matched",
      "reconciled",
      "independently_captured",
    ]);

    const old = before.cases[traces[legacy.caseId]!]!.provenance!;
    expect(old.legacy).toBe(true);
    expect(old.grade_at_seal).toBe("G0");
    expect(old.current_grade).toBe("G0");
    expect(old.source_line).toContain("G0 (legacy)");

    await recordGradeChange(pool, {
      organization_id: ORG,
      case_id: stage2.caseId,
      to_grade: "G2",
      reason: "Matched the settlement file from the processor",
      feed_name: "Processor settlement file",
      signingKey: signingKey(),
    });
    const after = await fetchSummary();
    const raised = after.cases[traces[stage2.caseId]!]!.provenance!;
    expect(raised.grade_at_seal).toBe("G0");
    expect(raised.current_grade).toBe("G2");
    expect(after.cases[traces[legacy.caseId]!]!.provenance!.current_grade).toBe("G0");
  });
});
