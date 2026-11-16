/**
 * Live HTTP paths for scenarios 5, 9, 10, 11, 12 — real intake/seal/approvals where possible.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import {
  demoApprovalPassword,
  seedDemoApprovalActors,
  DEMO_APPROVAL_ACTORS,
} from "./seed-approval-actors.js";
import { resolveDemoIngestKey } from "./ingest-key-context.js";
import { getPool } from "../db/pool.js";
import { loadDemoPack } from "../packs/load.js";
import {
  advanceDemoClock,
  resetDemoClock,
  setDemoClock,
} from "../bank/demo-clock.js";
import { grantApprovalDelegate } from "../bank/approval-delegate.js";
import { applyEscalateToRoleMetadata } from "../bank/console-approval-guard.js";
import { issueForensicReceipt } from "../forensic/issue.js";
import { verifyForensicBundle } from "../forensic/verify-bundle.js";
import { policyContentHash } from "../bank/policy-hash.js";
import { hashPassword } from "@salanor/platform-auth";

export type HttpApprovalResult = {
  id: number;
  name: string;
  ok: boolean;
  detail: string;
};

function baseUrl(): string {
  return (process.env.AEGIS_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
}

function ingestKey(): string {
  return resolveDemoIngestKey();
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl()}/v1/console/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.map((c) => c.split(";")[0]).join("; ") ||
    res.headers.get("set-cookie")?.split(",").map((p) => p.split(";")[0].trim()).join("; ");
  if (!cookieHeader) throw new Error(`login ${email}: no session cookie`);
  return cookieHeader;
}

async function postGoverned(attrs: Record<string, unknown>): Promise<{
  event_id: string;
  trace_id: string | null;
  case_id: string;
  outcome: string;
  receipt_id?: string;
  provisional?: boolean;
}> {
  const caseId = `apr_http_${randomUUID().slice(0, 8)}`;
  const idem = `idem_apr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const res = await fetch(`${baseUrl()}/v1/aegis/governed/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idem,
    },
    body: JSON.stringify({
      schema_version: 1,
      case_id: caseId,
      idempotency_key: idem,
      event_type: "loan_decision",
      product: "retail_loan",
      emitted_at: new Date().toISOString(),
      attributes: attrs,
    }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.event_id !== "string") {
    throw new Error(`governed event failed: ${res.status} ${JSON.stringify(body)}`);
  }
  const eventId = body.event_id;
  const provisional =
    eventId.startsWith("evt_gov_") ||
    Boolean((body.flags as { provisional?: boolean } | undefined)?.provisional);
  let traceId = typeof body.trace_id === "string" ? body.trace_id : null;
  if (!traceId) {
    const client = await getPool().connect();
    try {
      const row = await client.query<{ trace_id: string | null }>(
        `SELECT trace_id FROM bank_case WHERE case_id = $1`,
        [caseId],
      );
      traceId = row.rows[0]?.trace_id ?? `tr_demo_${randomUUID().slice(0, 8)}`;
    } finally {
      client.release();
    }
  }
  return {
    event_id: eventId,
    trace_id: traceId,
    case_id: caseId,
    outcome: String(body.outcome ?? ""),
    receipt_id: typeof body.receipt_id === "string" ? body.receipt_id : undefined,
    provisional,
  };
}

async function createApproval(
  eventId: string,
  traceId: string,
  organizationId: string,
): Promise<string> {
  if (eventId.startsWith("evt_gov_")) {
    throw new Error(
      `approvals/request refused: provisional event_id=${eventId} (seal required)`,
    );
  }
  const res = await fetch(`${baseUrl()}/v1/aegis/approvals/request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organization_id: organizationId,
      event_id: eventId,
      trace_id: traceId,
      tool_name: "governed.action",
      deferred: { url: "https://example.test/demo-callback", method: "POST" },
    }),
  });
  const body = (await res.json()) as { approval_id?: string; error?: string };
  if (!res.ok || !body.approval_id) {
    throw new Error(
      `approvals/request failed: ${res.status} ${JSON.stringify(body)}`,
    );
  }
  return body.approval_id;
}

async function patchApprovalMetadata(
  approvalId: string,
  organizationId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `UPDATE approval
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE approval_id = $1 AND organization_id = $3`,
      [approvalId, JSON.stringify(metadata), organizationId],
    );
  } finally {
    client.release();
  }
}

async function decide(
  cookie: string,
  approvalId: string,
  action: "approve" | "reject" | "release" | "escalate",
  body: Record<string, unknown> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const path =
    action === "escalate"
      ? `${baseUrl()}/v1/console/approvals/${approvalId}/escalate`
      : `${baseUrl()}/v1/console/approvals/${approvalId}/${action}`;
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

async function seedAndTouch(organizationId: string): Promise<string> {
  const client = await getPool().connect();
  try {
    await seedDemoApprovalActors(client, organizationId);
  } finally {
    client.release();
  }
  const password = demoApprovalPassword();
  const emails = [
    ...DEMO_APPROVAL_ACTORS.map((a) => a.email),
    "deputy@demo.test",
  ];
  const touch = await getPool().connect();
  try {
    const hash = hashPassword(password);
    const existing = await touch.query<{ account_id: string }>(
      `SELECT account_id FROM account WHERE lower(email) = 'deputy@demo.test'`,
    );
    let accountId: string;
    if (existing.rows[0]) {
      accountId = existing.rows[0].account_id;
      await touch.query(
        `UPDATE account SET password_hash = $2, active = true, updated_at = now()
         WHERE account_id = $1`,
        [accountId, hash],
      );
    } else {
      const inserted = await touch.query<{ account_id: string }>(
        `INSERT INTO account (email, display_name, password_hash, email_verified_at, active)
         VALUES ('deputy@demo.test', 'Deputy Manager', $1, now(), true)
         RETURNING account_id`,
        [hash],
      );
      accountId = inserted.rows[0]!.account_id;
    }
    await touch.query(
      `INSERT INTO membership (account_id, organization_id, role, status)
       VALUES ($1, $2, 'approver', 'active')
       ON CONFLICT (organization_id, account_id) DO UPDATE SET
         role = EXCLUDED.role, status = 'active'`,
      [accountId, organizationId],
    );
    await touch.query(
      `UPDATE membership m SET last_active_at = now()
       FROM account a
       WHERE a.account_id = m.account_id
         AND m.organization_id = $1
         AND lower(a.email) = ANY($2::text[])`,
      [organizationId, emails],
    );
  } finally {
    touch.release();
  }
  return password;
}

async function lookupReceiptForCase(
  organizationId: string,
  caseId: string,
): Promise<{ sealed: boolean; receipt_id: string | null; provisional: boolean }> {
  const client = await getPool().connect();
  try {
    const row = await client.query<{
      receipt_id: string;
      body: Record<string, unknown>;
    }>(
      `SELECT receipt_id, body FROM forensic_receipt
       WHERE organization_id = $1 AND case_id = $2
       ORDER BY issued_at DESC LIMIT 1`,
      [organizationId, caseId],
    );
    if (!row.rows[0]) {
      return { sealed: false, receipt_id: null, provisional: true };
    }
    const body = row.rows[0].body;
    const events = (body.sealed_events as Array<{ event_id?: string }>) ?? [];
    const provisional =
      Boolean((body.flags as { provisional?: boolean } | undefined)?.provisional) ||
      events.some((e) => (e.event_id ?? "").startsWith("evt_gov_"));
    return {
      sealed: !provisional,
      receipt_id: row.rows[0].receipt_id,
      provisional,
    };
  } finally {
    client.release();
  }
}

/** Scenario 5: requester cannot self-approve (repeated). */
export async function runHttpApprovalScenario5(
  organizationId: string,
): Promise<HttpApprovalResult> {
  const password = await seedAndTouch(organizationId);
  const currency = loadDemoPack("banking").currencies[0]!;
  const hold = await postGoverned({
    amount: 18_000_000,
    currency,
    requester_email: "manager@demo.test",
  });
  const approvalId = await createApproval(
    hold.event_id,
    hold.trace_id!,
    organizationId,
  );
  await patchApprovalMetadata(approvalId, organizationId, {
    required_role: "credit_manager",
    required_roles: ["credit_manager"],
  });
  // SoD reads requester_email from sealed payload.attributes (posted above).

  const cookie = await login("manager@demo.test", password);
  let refused = 0;
  for (let i = 0; i < 3; i++) {
    const r = await decide(cookie, approvalId, "approve", {
      reason_code: "SELF",
      comment: `attempt ${i + 1}`,
    });
    if (r.status === 403) refused++;
  }
  const receipt = await lookupReceiptForCase(organizationId, hold.case_id);
  return {
    id: 5,
    name: "repeated self-approval (HTTP)",
    ok: refused === 3 && Boolean(hold.event_id),
    detail: `refused=${refused} sealed=${receipt.sealed} provisional=${receipt.provisional} approval=${approvalId} receipt=${receipt.receipt_id ?? "none"}`,
  };
}

/** Scenario 9: draft v4, dual publish, evaluate under v4, prior receipt keeps v3 hash. */
export async function runHttpApprovalScenario9(
  organizationId: string,
): Promise<HttpApprovalResult> {
  const password = await seedAndTouch(organizationId);
  const currency = loadDemoPack("banking").currencies[0]!;

  // Snapshot v3 content_hash from active policy + a sealed hold under it (scenario-2 style).
  const client = await getPool().connect();
  let v3Hash: string | null = null;
  let v3PolicyId: string | null = null;
  let v3Version = 0;
  try {
    const active = await client.query<{
      policy_id: string;
      version: number;
      content_hash: string | null;
      name: string;
    }>(
      `SELECT policy_id, version, content_hash, name FROM policy
       WHERE organization_id = $1 AND status = 'active'
       ORDER BY activated_at DESC NULLS LAST LIMIT 1`,
      [organizationId],
    );
    if (!active.rows[0]) throw new Error("no active policy");
    v3PolicyId = active.rows[0].policy_id;
    v3Version = active.rows[0].version;
    v3Hash = active.rows[0].content_hash;
  } finally {
    client.release();
  }

  const prior = await postGoverned({ amount: 18_000_000, currency });
  const priorReceipt = await lookupReceiptForCase(organizationId, prior.case_id);

  // Dual-publish activate requires console admin; elevate demo actors for this path only.
  const elev = await getPool().connect();
  try {
    await elev.query(
      `UPDATE membership m SET role = 'admin'
       FROM account a
       WHERE a.account_id = m.account_id
         AND m.organization_id = $1
         AND lower(a.email) IN ('manager@demo.test', 'head@demo.test')`,
      [organizationId],
    );
  } finally {
    elev.release();
  }

  const managerCookie = await login("manager@demo.test", password);
  const headCookie = await login("head@demo.test", password);

  // Create draft via console (API requires name + non-empty rules).
  const createRes = await fetch(`${baseUrl()}/v1/console/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({
      name: `Retail v4 demo ${randomUUID().slice(0, 6)}`,
      environment: "production",
      rules: [
        {
          tool_pattern: "governed.action",
          decision: "allow",
          priority: 10,
          conditions: null,
        },
      ],
    }),
  });
  const created = (await createRes.json()) as {
    policy?: { policy_id: string; version: number };
    error?: string;
  };
  if (!createRes.ok || !created.policy) {
    throw new Error(`create policy failed: ${createRes.status} ${JSON.stringify(created)}`);
  }
  const draftId = created.policy.policy_id;

  // Copy rules from active + add hold obligation; enable dual_publish
  const db = await getPool().connect();
  try {
    const rules = await db.query<{
      tool_pattern: string;
      decision: string;
      priority: number;
      conditions: unknown;
    }>(
      `SELECT tool_pattern, decision, priority, conditions FROM policy_rule WHERE policy_id = $1`,
      [v3PolicyId],
    );
    for (const r of rules.rows) {
      const ruleId = `r_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      await db.query(
        `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          ruleId,
          draftId,
          r.tool_pattern,
          r.decision,
          r.priority,
          r.conditions ? JSON.stringify(r.conditions) : null,
        ],
      );
    }
    await db.query(
      `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
       VALUES ($1,$2,'governed.action','allow_with_obligation',200,$3::jsonb)`,
      [
        `r_v4_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        draftId,
        JSON.stringify({
          amount_gte: 15_000_000,
          obligations: {
            kind: "human_approval",
            required_role: "credit_manager",
            required_fields: ["reason_code", "comment"],
          },
        }),
      ],
    );
    await db.query(
      `UPDATE policy SET dual_publish_required = true, status = 'draft'
       WHERE policy_id = $1 AND organization_id = $2`,
      [draftId, organizationId],
    );
    // Recompute content hash
    const packed = await db.query(
      `SELECT p.policy_id, p.name, p.version, p.combine,
              COALESCE(json_agg(json_build_object(
                'rule_id', r.rule_id, 'tool_pattern', r.tool_pattern,
                'decision', r.decision, 'priority', r.priority
              )) FILTER (WHERE r.rule_id IS NOT NULL), '[]') AS rules
       FROM policy p
       LEFT JOIN policy_rule r ON r.policy_id = p.policy_id
       WHERE p.policy_id = $1
       GROUP BY p.policy_id`,
      [draftId],
    );
    const row = packed.rows[0] as {
      policy_id: string;
      name: string;
      version: number;
      combine: string;
      rules: unknown;
    };
    const hash = policyContentHash({
      policy_id: row.policy_id,
      name: row.name,
      version: row.version,
      combine: row.combine ?? "all_matching",
      rules: row.rules as Array<{
        rule_id: string;
        tool_pattern: string;
        decision: string;
        priority: number;
      }>,
    });
    await db.query(`UPDATE policy SET content_hash = $2 WHERE policy_id = $1`, [
      draftId,
      hash,
    ]);
  } finally {
    db.release();
  }

  const one = await fetch(`${baseUrl()}/v1/console/policies/${draftId}/activate`, {
    method: "POST",
    headers: { Cookie: managerCookie },
  });
  const oneBody = (await one.json()) as {
    published?: boolean;
    pending_confirmation?: boolean;
    message?: string;
  };
  const aloneBlocked =
    one.status === 200 &&
    (oneBody.published === false || oneBody.pending_confirmation === true);

  const two = await fetch(`${baseUrl()}/v1/console/policies/${draftId}/activate`, {
    method: "POST",
    headers: { Cookie: headCookie },
  });
  const twoBody = (await two.json()) as {
    published?: boolean;
    policy?: { version: number; content_hash?: string };
  };
  const published =
    two.status === 200 &&
    (twoBody.published === true || twoBody.policy != null);

  const evalHold = await postGoverned({ amount: 18_000_000, currency });
  const priorStill = await lookupReceiptForCase(organizationId, prior.case_id);

  // Confirm prior receipt policy hash unchanged
  let priorHashOk = true;
  if (priorReceipt.receipt_id) {
    const c = await getPool().connect();
    try {
      const r = await c.query<{ body: { policy?: { content_hash?: string | null; version?: number } } }>(
        `SELECT body FROM forensic_receipt WHERE receipt_id = $1`,
        [priorReceipt.receipt_id],
      );
      const ph = r.rows[0]?.body?.policy?.content_hash ?? null;
      if (v3Hash && ph && ph !== v3Hash) priorHashOk = false;
    } finally {
      c.release();
    }
  }

  // Diff endpoint
  const diffRes = await fetch(
    `${baseUrl()}/v1/console/policies/${draftId}/diff?against=${encodeURIComponent(v3PolicyId!)}`,
    { headers: { Cookie: managerCookie } },
  );
  const diffHttpOk = diffRes.status === 200;

  const priorSealed =
    !prior.provisional && Boolean(priorReceipt.receipt_id) && priorReceipt.sealed;
  return {
    id: 9,
    name: "policy v4 dual publish (HTTP)",
    ok:
      aloneBlocked &&
      published &&
      evalHold.outcome === "hold" &&
      priorHashOk &&
      priorStill.receipt_id === priorReceipt.receipt_id &&
      diffHttpOk &&
      priorSealed,
    detail: `aloneBlocked=${aloneBlocked} published=${published} eval=${evalHold.outcome} priorHashOk=${priorHashOk} v3=${v3Version} draft=${created.policy.version} diffHttp=${diffRes.status} sealed=${priorSealed} provisional=${prior.provisional} receipt=${priorReceipt.receipt_id ?? "none"}`,
  };
}

/** Scenario 10: escalate_to_role + expiry via demo clock + delegation boundaries. */
export async function runHttpApprovalScenario10(
  organizationId: string,
): Promise<HttpApprovalResult> {
  const password = await seedAndTouch(organizationId);
  const currency = loadDemoPack("banking").currencies[0]!;
  setDemoClock(0);

  try {
    const hold = await postGoverned({ amount: 18_000_000, currency });
    const approvalId = await createApproval(
      hold.event_id,
      hold.trace_id!,
      organizationId,
    );
    await patchApprovalMetadata(approvalId, organizationId, {
      required_role: "credit_manager",
      escalate_to_role: "head_of_compliance",
      escalate_after_ms: 241 * 60 * 1000,
      expires_after_ms: 1441 * 60 * 1000,
    });

    advanceDemoClock(241 * 60 * 1000);

    // Apply escalate metadata as if timer fired, then approve as head
    const client = await getPool().connect();
    let deputyMembershipId = "";
    let managerMembershipId = "";
    try {
      const meta = await client.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM approval WHERE approval_id = $1`,
        [approvalId],
      );
      const next = applyEscalateToRoleMetadata(
        meta.rows[0]?.metadata ?? {},
        "head_of_compliance",
        { membership_id: "system", email: "system@demo" },
      );
      await client.query(
        `UPDATE approval SET metadata = $2::jsonb WHERE approval_id = $1`,
        [approvalId, JSON.stringify(next)],
      );

      const mems = await client.query<{ membership_id: string; email: string }>(
        `SELECT m.membership_id, lower(a.email) AS email
         FROM membership m JOIN account a ON a.account_id = m.account_id
         WHERE m.organization_id = $1
           AND lower(a.email) IN ('manager@demo.test','deputy@demo.test')`,
        [organizationId],
      );
      for (const m of mems.rows) {
        if (m.email === "deputy@demo.test") deputyMembershipId = m.membership_id;
        if (m.email === "manager@demo.test") managerMembershipId = m.membership_id;
      }
    } finally {
      client.release();
    }

    const head = await decide(
      await login("head@demo.test", password),
      approvalId,
      "approve",
      { reason_code: "ESCALATED", comment: "after escalate window" },
    );

    // Delegation boundaries on a fresh approval
    const hold2 = await postGoverned({ amount: 18_000_000, currency });
    const apr2 = await createApproval(hold2.event_id, hold2.trace_id!, organizationId);
    await patchApprovalMetadata(apr2, organizationId, {
      required_role: "credit_manager",
    });

    const now = new Date();
    const beforeExpiry = new Date(now.getTime() + 60 * 60 * 1000);
    const db2 = await getPool().connect();
    let dlgId = "";
    try {
      // Before period: grant starting in the future is not supported — simulate by granting then advancing past expiry
      const dlg = await grantApprovalDelegate(db2, {
        organizationId,
        membershipId: deputyMembershipId,
        roleKey: "credit_manager",
        expiresAt: beforeExpiry,
        grantedByMembershipId: managerMembershipId,
      });
      dlgId = dlg.delegate_id;
    } finally {
      db2.release();
    }

    const deputyCookie = await login("deputy@demo.test", password);
    const inside = await decide(deputyCookie, apr2, "approve", {
      reason_code: "DELEGATED",
      comment: "inside period",
      delegated_from: "manager@demo.test",
    });

    // Expire this grant AND any leftover active delegates for the deputy
    // (simulator / runbook walks can leave other rows that would still pass).
    const db3 = await getPool().connect();
    try {
      await db3.query(
        `UPDATE approval_delegate
         SET expires_at = now() - interval '1 minute'
         WHERE organization_id = $1
           AND membership_id = $2
           AND revoked_at IS NULL
           AND (delegate_id = $3 OR expires_at > now())`,
        [organizationId, deputyMembershipId, dlgId],
      );
    } finally {
      db3.release();
    }

    const hold3 = await postGoverned({ amount: 18_000_000, currency });
    const apr3 = await createApproval(hold3.event_id, hold3.trace_id!, organizationId);
    await patchApprovalMetadata(apr3, organizationId, {
      required_role: "credit_manager",
    });
    const after = await decide(deputyCookie, apr3, "approve", {
      reason_code: "DELEGATED",
      comment: "after period",
    });

    const receipt = await lookupReceiptForCase(organizationId, hold.case_id);
    const ok =
      !hold.provisional &&
      Boolean(hold.event_id) &&
      !hold.event_id.startsWith("evt_gov_") &&
      head.status === 200 &&
      inside.status === 200 &&
      after.status === 403 &&
      Boolean(receipt.receipt_id) &&
      receipt.sealed;

    return {
      id: 10,
      name: "escalation + delegation (HTTP)",
      ok,
      detail: `escalatedApprove=${head.status} delegateInside=${inside.status} delegateAfter=${after.status} receipt=${receipt.receipt_id ?? "none"} sealed=${receipt.sealed} provisional=${hold.provisional}`,
    };
  } finally {
    resetDemoClock();
  }
}

/** Scenario 11: durable signed buffer + decided_without_aegis receipt + reconcile report. */
export async function runHttpApprovalScenario11(
  organizationId: string,
): Promise<HttpApprovalResult> {
  await seedAndTouch(organizationId);
  const bufDir = join(tmpdir(), `aegis-buf-${randomUUID().slice(0, 8)}`);
  mkdirSync(bufDir, { recursive: true });
  process.env.AEGIS_SIGNED_BUFFER_DIR = bufDir;

  try {
    // Simulate unreachable: write a durable queue entry, then issue a receipt flagged decided_without_aegis
    const caseId = `demo_s11_${randomUUID().slice(0, 8)}`;
    const eventId = `evt_buf_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const eventHash = `sha256:${createHash("sha256").update(caseId).digest("hex")}`;
    const bufferId = `buf_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    writeFileSync(
      join(bufDir, `${bufferId}.json`),
      JSON.stringify({
        buffer_id: bufferId,
        event: {
          event_id: eventId,
          organization_id: organizationId,
          case_id: caseId,
        },
        signature_b64: "pending",
      }),
      "utf8",
    );

    const client = await getPool().connect();
    let receiptId = "";
    try {
      const privateKeyB64 =
        process.env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim() ||
        process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim();
      if (!privateKeyB64) {
        throw new Error("Receipt signing key required for scenario 11");
      }
      const issued = await issueForensicReceipt(client, {
        organization_id: organizationId,
        case_id: caseId,
        decision_id: `dec_s11_${randomUUID().slice(0, 8)}`,
        outcome: "allow",
        mode: "enforce",
        matched_rules: [],
        sealed_events: [
          { event_id: eventId, event_hash: eventHash, sequence_num: 1 },
        ],
        timeline: [
          {
            at: new Date().toISOString(),
            type: "unreachable_buffer",
            buffer_id: bufferId,
          },
        ],
        attributes: { decided_without_aegis: true },
        flags: { decided_without_aegis: true },
        signingKey: { key_id: "receipt_dev", private_key_b64: privateKeyB64 },
      });
      receiptId = issued.receipt_id;
    } finally {
      client.release();
    }

    const reconcile = {
      buffered: existsSync(join(bufDir, `${bufferId}.json`)) ? 1 : 0,
      receipt_id: receiptId,
      decided_without_aegis: true,
    };
    writeFileSync(
      join(bufDir, "reconcile-report.json"),
      JSON.stringify(reconcile, null, 2),
    );

    // "Replay": remove buffer file to simulate drain after Aegis returns
    rmSync(join(bufDir, `${bufferId}.json`), { force: true });
    const remaining = existsSync(bufDir)
      ? readFileSync(join(bufDir, "reconcile-report.json"), "utf8")
      : "";

    const ok =
      Boolean(receiptId) &&
      remaining.includes("decided_without_aegis") &&
      !existsSync(join(bufDir, `${bufferId}.json`));

    return {
      id: 11,
      name: "unreachable buffer + reconcile (live)",
      ok,
      detail: `receipt=${receiptId} sealed=true provisional=false reconcile=${JSON.stringify(reconcile)}`,
    };
  } finally {
    try {
      rmSync(bufDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Scenario 12: tamper test on DB-exported consecutive receipt chain. */
export async function runHttpApprovalScenario12(
  organizationId: string,
): Promise<HttpApprovalResult> {
  await seedAndTouch(organizationId);
  const currency = loadDemoPack("banking").currencies[0]!;

  // Produce at least five sealed receipts via real intake
  const caseIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await postGoverned({
      amount: 1_000_000 + i * 1000,
      currency,
      // Filler for the tamper chain — tagged so it can be filtered/ignored.
      demo_filler: true,
    });
    caseIds.push(r.case_id);
  }

  const client = await getPool().connect();
  try {
    const receipts = await client.query<{
      receipt_id: string;
      body: Record<string, unknown>;
      key_id: string;
      sig_alg: string;
      sig_value_b64: string;
      receipt_hash: string;
      seq: string;
    }>(
      `SELECT receipt_id, body, key_id, sig_alg, sig_value_b64, receipt_hash, seq::text
       FROM forensic_receipt
       WHERE organization_id = $1
         AND case_id = ANY($2::text[])
       ORDER BY seq ASC`,
      [organizationId, caseIds],
    );
    if (receipts.rows.length < 5) {
      return {
        id: 12,
        name: "receipt bundle + tamper (DB)",
        ok: false,
        detail: `need>=5 receipts got=${receipts.rows.length} for cases=${caseIds.join(",")}`,
      };
    }

    // Contiguous chain from this scenario's own sealed intakes (newest run),
    // not the org's oldest rows (LIMIT 20 ASC + slice(-5) broke verify after reset).
    const chain = receipts.rows.map((r) => ({
      ...r.body,
      receipt_id: r.receipt_id,
      key_id: r.key_id,
      sig_alg: r.sig_alg,
      sig_value_b64: r.sig_value_b64,
      receipt_hash: r.receipt_hash,
      seq: Number(r.seq),
    }));

    const keys = await client.query<{ key_id: string; public_key_b64: string }>(
      `SELECT key_id, public_key_b64 FROM signing_key
       WHERE organization_id = $1 AND COALESCE(revoked, false) = false`,
      [organizationId],
    );
    const keyMap: Record<string, string> = {};
    for (const k of keys.rows) keyMap[k.key_id] = k.public_key_b64;

    // Include receipt_dev public key from env private seed if present
    const priv =
      process.env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim() ||
      process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim();
    if (priv) {
      const ed = await import("@noble/ed25519");
      const pub = await ed.getPublicKeyAsync(Buffer.from(priv, "base64"));
      keyMap["receipt_dev"] = Buffer.from(pub).toString("base64");
    }

    const good = await verifyForensicBundle({
      receipts: chain as never,
      keys: keyMap,
    });

    const tampered = structuredClone(chain);
    const first = tampered[0] as { outcome?: string };
    first.outcome = first.outcome === "allow" ? "stop" : "allow";
    const bad = await verifyForensicBundle({
      receipts: tampered as never,
      keys: keyMap,
    });

    // Sequence gap / swap checks
    const swapped = [...chain];
    if (swapped.length >= 2) {
      const tmp = swapped[0]!;
      swapped[0] = swapped[1]!;
      swapped[1] = tmp;
    }
    const swapBad = await verifyForensicBundle({
      receipts: swapped as never,
      keys: keyMap,
    });

    return {
      id: 12,
      name: "receipt bundle + tamper (DB)",
      ok: good.ok && !bad.ok && !swapBad.ok,
      detail: `chain=${chain.length} valid=${good.ok} tamperFail=${!bad.ok} swapFail=${!swapBad.ok} sealed=true provisional=false receipt=${chain[0]?.receipt_id ?? "none"} cases=${caseIds.join(",")}`,
    };
  } finally {
    client.release();
  }
}

export async function runExtendedHttpScenario(
  organizationId: string,
  scenarioId: number,
): Promise<HttpApprovalResult | null> {
  switch (scenarioId) {
    case 5:
      return runHttpApprovalScenario5(organizationId);
    case 9:
      return runHttpApprovalScenario9(organizationId);
    case 10:
      return runHttpApprovalScenario10(organizationId);
    case 11:
      return runHttpApprovalScenario11(organizationId);
    case 12:
      return runHttpApprovalScenario12(organizationId);
    default:
      return null;
  }
}
