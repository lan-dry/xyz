/**
 * Seed a realistic "lived-in" history into Demo Bank: 8 synthetic RWF cases
 * with mixed outcomes, spread over the last week (business hours, Africa/Kigali,
 * from the demo clock) and labelled `demo_history` so nobody mistakes them for live data. Every hold is resolved through the real HTTP approval
 * path (request → console login → approve/reject), so the pending queue ends
 * EMPTY and the live demo starts from a clean slate.
 *
 * All names are synthetic Rwandan-style placeholders — no real people.
 * No scenario-12 style filler is created here (nothing tagged `demo_filler`).
 *
 * Needs the API running (demo:up) with AEGIS_DEMO_MODE=true on the server.
 *
 *   pnpm demo:seed-story                    # Demo Bank (slug demo-bank)
 *   pnpm demo:seed-story -- --org <uuid>
 *
 * Refuses if the org already has cases (run `pnpm demo:reset` first).
 */
import "../db/load-env.js";
import { assertDemoMode, nowMs } from "../bank/demo-clock.js";
import { resolveIngestKey } from "../auth/ingest-key.js";
import {
  DEMO_BANK_AGENTS,
  DEMO_BANK_SLUG,
  demoBankAgentIds,
  type DemoBankAgentKey,
} from "../db/demo-bank-fixture.js";
import { closePool, getPool } from "../db/pool.js";
import { getOrganizationIdBySlug } from "../db/resolve-organization.js";
import {
  createApproval,
  decide,
  login,
  patchApprovalMetadata,
  postGoverned,
  seedAndTouch,
} from "./live-approvals-http.js";

const CURRENCY = "RWF";
/** Within the credit officer's limit (allowed automatically). Keep in sync with the simulator + runbook. */
const WITHIN_LIMIT_AMOUNT = 1_200_000;
const KIGALI_OFFSET_HOURS = 2; // Africa/Kigali is UTC+2, no DST.

/**
 * Wall-clock time in Kigali on `daysAgo` days before today, from the demo clock.
 * Never later than 20 minutes ago, so same-day history is never in the future.
 */
function historyTime(at: StoryCase["at"]): Date {
  const now = nowMs();
  const k = new Date(now + KIGALI_OFFSET_HOURS * 3_600_000);
  const ms = Date.UTC(
    k.getUTCFullYear(),
    k.getUTCMonth(),
    k.getUTCDate() - at.daysAgo,
    at.hour - KIGALI_OFFSET_HOURS,
    at.minute,
  );
  return new Date(Math.min(ms, now - 20 * 60_000));
}

type Resolution = {
  action: "approve" | "reject";
  actor: "manager@demo.test" | "head@demo.test";
  body: Record<string, unknown>;
  /** Minutes after the case was emitted that the approver decided (history timestamps). */
  decideAfterMin: number;
};

type StoryCase = {
  ref: string;
  /** When the case was emitted, in Africa/Kigali time on a day before "today" (demo clock). */
  at: { daysAgo: number; hour: number; minute: number };
  agent: DemoBankAgentKey;
  eventType: string;
  expect: "allow" | "hold";
  attrs: Record<string, unknown>;
  resolve?: Resolution;
};

const STORY: StoryCase[] = [
  {
    ref: "LN-RW-0412",
    at: { daysAgo: 6, hour: 9, minute: 42 },
    agent: "credit-decision",
    eventType: "loan_decision",
    expect: "allow",
    attrs: {
      // Same amount as the simulator story and the runbook: within the officer limit.
      amount: WITHIN_LIMIT_AMOUNT,
      currency: CURRENCY,
      applicant_name: "Uwase Aline",
      branch: "Kigali - Nyarugenge",
      loan_purpose: "School fees bridge loan",
    },
  },
  {
    ref: "LN-RW-0413",
    at: { daysAgo: 5, hour: 14, minute: 15 },
    agent: "credit-decision",
    eventType: "loan_decision",
    expect: "allow",
    attrs: {
      amount: 3_500_000,
      currency: CURRENCY,
      applicant_name: "Habimana Jean Claude",
      branch: "Huye",
      loan_purpose: "Moto-taxi purchase",
    },
  },
  {
    ref: "LN-RW-0414",
    at: { daysAgo: 4, hour: 11, minute: 5 },
    agent: "core-banking",
    eventType: "loan_decision",
    expect: "allow",
    attrs: {
      amount: 4_200_000,
      currency: CURRENCY,
      applicant_name: "Iradukunda Sandrine",
      branch: "Musanze",
      loan_purpose: "Working capital - retail boutique",
    },
  },
  {
    ref: "DATA-RW-0415",
    at: { daysAgo: 3, hour: 16, minute: 30 },
    agent: "customer-data",
    eventType: "data_access",
    expect: "allow",
    attrs: {
      amount: 1_000_000,
      currency: CURRENCY,
      // Masked by the pack's field policy (keep last 4).
      national_id: "1199880045123456",
      purpose: "kyc_refresh",
      applicant_name: "Ishimwe Grace",
    },
  },
  {
    ref: "PAY-RW-0416",
    at: { daysAgo: 2, hour: 10, minute: 20 },
    agent: "payments-gateway",
    // Labelled "Payment release" on screens (event_type decides the label).
    eventType: "payment_transfer",
    expect: "allow",
    attrs: {
      amount: 4_800_000,
      currency: CURRENCY,
      applicant_name: "Nsengiyumva Patrick",
      branch: "Kigali - Kicukiro",
      loan_purpose: "Disbursement to settlement account",
    },
  },
  {
    ref: "LN-RW-0417",
    at: { daysAgo: 2, hour: 15, minute: 45 },
    agent: "credit-decision",
    eventType: "loan_decision",
    expect: "hold",
    attrs: {
      amount: 9_500_000,
      currency: CURRENCY,
      applicant_name: "Mukamana Divine",
      branch: "Rubavu",
      loan_purpose: "Dairy cooperative equipment",
    },
    resolve: {
      action: "approve",
      actor: "manager@demo.test",
      decideAfterMin: 38,
      body: {
        reason_code: "CREDIT_OK",
        comment: "Cooperative cash flow verified; within manager authority.",
      },
    },
  },
  {
    ref: "LN-RW-0418",
    at: { daysAgo: 1, hour: 11, minute: 10 },
    agent: "credit-decision",
    eventType: "loan_decision",
    expect: "hold",
    attrs: {
      amount: 12_000_000,
      currency: CURRENCY,
      applicant_name: "Niyonsenga Eric",
      branch: "Kigali - Gasabo",
      loan_purpose: "Minibus (public transport) purchase",
      model: {
        id: "risk-v2",
        version: "2.1",
        score: 0.82,
        recommendation: "decline",
      },
      // Model override: requester is not the approver (separation of duties).
      requester_email: "officer@demo.test",
    },
    resolve: {
      action: "approve",
      actor: "head@demo.test",
      decideAfterMin: 95,
      body: {
        reason_code: "MODEL_OVERRIDE",
        comment: "Repayment history supports override of model recommendation.",
      },
    },
  },
  {
    ref: "LN-RW-0419",
    at: { daysAgo: 0, hour: 8, minute: 30 },
    agent: "credit-decision",
    eventType: "loan_decision",
    expect: "hold",
    attrs: {
      amount: 28_000_000,
      currency: CURRENCY,
      applicant_name: "Kamanzi Emmanuel",
      branch: "Rwamagana",
      loan_purpose: "Commercial property fit-out",
    },
    resolve: {
      action: "reject",
      actor: "manager@demo.test",
      decideAfterMin: 22,
      body: {
        reason: "Collateral valuation below policy threshold",
        reason_code: "COMPLIANCE_STOP",
        comment: "Declined: collateral cover insufficient for requested amount.",
      },
    },
  },
];

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  assertDemoMode("demo seed-story");
  const args = process.argv.slice(2);
  const pool = getPool();

  const slug = argValue(args, "--slug") ?? DEMO_BANK_SLUG;
  const organizationId =
    argValue(args, "--org") ?? (await getOrganizationIdBySlug(pool, slug));
  if (!organizationId) {
    throw new Error(
      `Organisation "${slug}" not found. Run pnpm demo:up (or db:demo-bank-fixture) first.`,
    );
  }

  const key =
    process.env.AEGIS_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_DEV_KEY?.trim();
  if (!key) throw new Error("AEGIS_INGEST_KEY or AEGIS_INGEST_DEV_KEY required");
  const auth = await resolveIngestKey(pool, key);
  if (!auth || auth.organizationId !== organizationId) {
    throw new Error(
      `AEGIS_INGEST_KEY resolves to ${auth?.organizationId ?? "no org"}, not ${organizationId}. ` +
        "Refusing to seed the wrong organisation (run demo:up to rewire the Demo Bank ingest key).",
    );
  }

  const existing = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM bank_case WHERE organization_id = $1`,
    [organizationId],
  );
  if (Number(existing.rows[0]?.n ?? 0) > 0) {
    throw new Error(
      `Org already has ${existing.rows[0]!.n} case(s). Run pnpm demo:reset first (seed-story is for a clean org).`,
    );
  }

  const password = await seedAndTouch(organizationId);
  const cookies = new Map<string, string>();
  async function cookieFor(email: string): Promise<string> {
    let c = cookies.get(email);
    if (!c) {
      c = await login(email, password);
      cookies.set(email, c);
    }
    return c;
  }

  console.log(`seed-story → org ${organizationId} (${slug}), ${STORY.length} cases`);
  let failed = 0;

  for (const s of STORY) {
    const agentIds = demoBankAgentIds(slug, s.agent);
    const emitted = historyTime(s.at);
    try {
      // `demo_history` labels this as synthetic back-dated history (shown in the Live feed).
      const posted = await postGoverned(
        { ...s.attrs, demo_history: true },
        {
          caseId: s.ref,
          agentId: agentIds.agentId,
          eventType: s.eventType,
          emittedAt: emitted.toISOString(),
        },
      );
      if (!posted.sealed) {
        throw new Error(`not sealed (event_id=${posted.event_id})`);
      }
      if (posted.outcome !== s.expect) {
        throw new Error(`expected outcome=${s.expect}, got ${posted.outcome}`);
      }

      // The server stamps rows with its own clock; move the soft (non-sealed) case row
      // back to the nominal history time so the Live feed shows a real spread of days.
      await pool.query(
        `UPDATE bank_case SET created_at = $3, updated_at = $3
          WHERE organization_id = $1 AND case_id = $2`,
        [organizationId, s.ref, emitted],
      );

      let final: string = posted.outcome;
      if (s.resolve) {
        const approvalId = await createApproval(
          posted.event_id,
          posted.trace_id!,
          organizationId,
        );
        await patchApprovalMetadata(approvalId, organizationId, {
          required_role: "credit_manager",
          required_roles: ["credit_manager"],
          required_fields: ["reason_code", "comment"],
        });
        const res = await decide(
          await cookieFor(s.resolve.actor),
          approvalId,
          s.resolve.action,
          s.resolve.body,
        );
        if (res.status !== 200) {
          throw new Error(
            `${s.resolve.action} by ${s.resolve.actor} → http ${res.status} ${JSON.stringify(res.json)}`,
          );
        }
        // Mirror the soft case-status update the console `/release` route does,
        // so resolved holds don't linger as "held" in the case list.
        await pool.query(
          `UPDATE bank_case SET status = $3, updated_at = now()
            WHERE organization_id = $1 AND case_id = $2
              AND status IN ('open', 'held', 'stopped')`,
          [
            organizationId,
            s.ref,
            s.resolve.action === "approve" ? "approved" : "stopped",
          ],
        );
        // Same for the approval request and the vote (approver + decision time on screens).
        const decidedAt = new Date(emitted.getTime() + s.resolve.decideAfterMin * 60_000);
        await pool.query(
          `UPDATE bank_case SET updated_at = $3
            WHERE organization_id = $1 AND case_id = $2`,
          [organizationId, s.ref, decidedAt],
        );
        await pool.query(
          `UPDATE approval SET created_at = $3, decided_at = $4
            WHERE approval_id = $1 AND organization_id = $2`,
          [approvalId, organizationId, emitted, decidedAt],
        );
        await pool.query(
          `UPDATE approval_vote SET created_at = $3
            WHERE approval_id = $1 AND organization_id = $2`,
          [approvalId, organizationId, decidedAt],
        );
        final = `${posted.outcome} → ${s.resolve.action === "approve" ? "approved" : "rejected"} by ${s.resolve.actor}`;
      }
      console.log(
        `  PASS ${s.ref} [${s.agent}] ${String(s.attrs.amount)} RWF @ ${emitted.toISOString()} — ${final}`,
      );
    } catch (err) {
      failed++;
      console.error(
        `  FAIL ${s.ref}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const pending = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM approval
      WHERE organization_id = $1 AND status = 'pending'`,
    [organizationId],
  );
  const pendingN = Number(pending.rows[0]?.n ?? 0);
  console.log(
    `seed-story done: failed=${failed} pending_approvals=${pendingN} (agents: ${DEMO_BANK_AGENTS.map((a) => a.displayName).join(", ")})`,
  );
  if (failed > 0 || pendingN > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
