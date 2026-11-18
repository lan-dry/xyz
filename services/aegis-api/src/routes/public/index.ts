import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import {
  DEMO_BANK_SLUG,
  sampleBundlesAccess,
} from "../../bank/demo-tenant.js";
import {
  describeDecision,
  formatApprover,
  formatRuleLabel,
  OUTCOME_LABELS,
} from "../../bank/describe-decision.js";
import { loadDemoSampleBundles } from "../../demo/sample-bundles.js";
import {
  auditReceiptAccess,
  caseIdFromPayload,
  RECEIPT_ACCESS_ACTIONS,
} from "../../console/receipt-access-audit.js";
import {
  trustedReceiptKeys,
  verifyBundleFile,
} from "../../forensic/evidence-bundle.js";
import {
  collectPublicKeys,
  RECEIPT_SIGNATURE_SCHEME,
} from "../../forensic/public-keys.js";
import { getDidDocumentByAgent, getDidDocumentByDid } from "../../repo/did.js";
import { buildPublicVerificationBundle } from "../../transparency/bundle.js";
import { loadProvenanceForEvent } from "../../forensic/case-provenance.js";
import { verifyPublicVerificationBundle } from "../../transparency/verify-public.js";

export const publicRoutes = new Hono();

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

/**
 * Stateless check of a dropped evidence bundle. No login and no database:
 * everything needed is in the file; keys Aegis published are pinned from env.
 */
publicRoutes.post("/evidence-bundle/verify", async (c) => {
  const text = await c.req.text();
  if (text.length > MAX_BUNDLE_BYTES) {
    return c.json(
      { error: "not_a_bundle", message: "The file is too large to be an evidence bundle." },
      413,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return c.json(
      {
        ok: false,
        error: "not_a_bundle",
        message:
          "The file could not be read. It is not valid evidence data, or it was damaged or edited.",
        checks: [],
        findings: [],
      },
      400,
    );
  }
  const result = await verifyBundleFile(parsed, {
    trustedKeys: await trustedReceiptKeys(),
  });
  return c.json(result, result.error ? 400 : 200);
});

/**
 * Public receipt signing keys: key id, raw Ed25519 public key, fingerprint and
 * custody (AWS KMS vs software). Includes retired keys so old receipts verify.
 * Pin these out of band; compare fingerprints with the ones in evidence bundles.
 */
publicRoutes.get("/keys", async (c) => {
  const keys = await collectPublicKeys();
  return c.json(
    {
      generated_at: new Date().toISOString(),
      signature_scheme: RECEIPT_SIGNATURE_SCHEME,
      keys,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});

/** Flat key_id -> public key map; drop-in for `aegis-verify --keys keys.json`. */
publicRoutes.get("/keys.json", async (c) => {
  const keys = await collectPublicKeys();
  return c.json(
    Object.fromEntries(keys.map((k) => [k.key_id, k.public_key_b64])),
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});

/**
 * Demo Bank only: latest real evidence bundle + a tampered copy for Verify.
 * Requires organization.is_demo.
 */
publicRoutes.get("/demo/sample-bundles", async (c) => {
  const slug = c.req.query("org")?.trim() || DEMO_BANK_SLUG;
  const slugGate = sampleBundlesAccess(slug, true);
  if (!slugGate.ok && slugGate.status === 404) {
    return c.json(
      { error: "not_a_demo_org", message: "Sample bundles exist only for Demo Bank." },
      404,
    );
  }
  const client = await getPool().connect();
  try {
    const org = await client.query<{ is_demo: boolean }>(
      `SELECT is_demo FROM organization WHERE slug = $1`,
      [slug],
    );
    const access = sampleBundlesAccess(slug, org.rows[0]?.is_demo === true);
    if (!access.ok) {
      return c.json(
        {
          error: "not_a_demo_org",
          message: "Sample bundles are only available for Demo Bank.",
        },
        access.status,
      );
    }
    const samples = await loadDemoSampleBundles(client, slug);
    if (!samples) {
      return c.json(
        {
          error: "no_demo_receipt",
          message:
            "Demo Bank has no signed case yet. Run the demo seed, then try again.",
        },
        404,
      );
    }
    return c.json(samples, 200, { "Cache-Control": "no-store" });
  } finally {
    client.release();
  }
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function textOf(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushFieldNames(target: string[], value: unknown) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && item.trim()) target.push(item.trim());
  }
}

function humanField(raw: string): string {
  return raw.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function seenSentence(fields: string[]): string | null {
  const labels = [...new Set(fields.map(humanField).filter(Boolean))];
  if (labels.length === 0) return null;
  if (labels.length === 1) return `Read ${labels[0]}.`;
  if (labels.length === 2) return `Read ${labels[0]} and ${labels[1]}.`;
  return `Read ${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}.`;
}

function anomalySentence(type: string | null, reason: string | null): string | null {
  if (!reason && !type) return null;
  if (!reason) return "Suspicious behaviour flagged — review required";
  if (type === "prompt_injection_indicator") {
    return `Possible prompt injection detected: ${reason}`;
  }
  if (type === "sensitive_data_exfiltration") {
    return `Possible attempt to take extra customer data: ${reason}`;
  }
  if (type === "unexpected_tool") return `Unexpected action detected: ${reason}`;
  return `Flagged: ${reason}`;
}

function isEmailSourced(payload: Record<string, unknown>): boolean {
  const source = textOf(payload, "source")?.toLowerCase() ?? "";
  if (source === "email" || source.includes("email")) return true;
  return Boolean(
    textOf(payload, "email_from") ||
      textOf(payload, "email_to") ||
      textOf(payload, "mailbox"),
  );
}

type TraceStep = {
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  payload: unknown;
  emitted_at?: string | Date | null;
};

function isBankPayload(p: Record<string, unknown>): boolean {
  return (
    typeof p.outcome === "string" &&
    Array.isArray(p.matched_rules) &&
    Boolean(p.attributes) &&
    typeof p.attributes === "object"
  );
}

function numOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Same decision sentence as the case page (amount, rule, approver, reason).
 * Built from the sealed bank payload + human_approval sibling when present.
 */
function decisionTextFromSteps(steps: TraceStep[]): string | null {
  let bank: Record<string, unknown> | null = null;
  let approval: Record<string, unknown> | null = null;
  let approvalAt: string | null = null;
  let approvalDecision: string | null = null;

  for (const step of steps) {
    const payload =
      step.payload && typeof step.payload === "object"
        ? (step.payload as Record<string, unknown>)
        : null;
    if (!payload) continue;
    if (step.action_kind === "policy_decision" && isBankPayload(payload)) {
      bank = payload;
    }
    if (step.action_kind === "human_approval") {
      approval = payload;
      approvalDecision =
        textOf(payload, "decision") ?? step.policy_decision ?? approvalDecision;
      const at = step.emitted_at;
      approvalAt =
        typeof at === "string"
          ? at
          : at instanceof Date
            ? at.toISOString()
            : approvalAt;
    }
  }
  if (!bank) return null;

  const attrs = bank.attributes as Record<string, unknown>;
  const rules = (bank.matched_rules as Array<{ rule_id?: string; decision?: string }>)
    .map((r) => (typeof r.rule_id === "string" ? r.rule_id : null))
    .filter((x): x is string => Boolean(x));
  const bankOutcome = textOf(bank, "outcome") ?? "allow";
  const approved =
    approvalDecision === "approved" || approvalDecision === "released";
  const declined =
    approvalDecision === "rejected" ||
    approvalDecision === "denied" ||
    approvalDecision === "declined";
  const decided =
    textOf(bank, "decided_by_rule_id") ??
    (bank.decision_basis &&
    typeof bank.decision_basis === "object" &&
    typeof (bank.decision_basis as { decided_by_rule_id?: unknown })
      .decided_by_rule_id === "string"
      ? String(
          (bank.decision_basis as { decided_by_rule_id: string })
            .decided_by_rule_id,
        )
      : null) ??
    (bankOutcome === "hold" || bankOutcome === "stop"
      ? rules.find((r) => !/(^|_)AUTH-RL(-1)?$/.test(r))
      : null) ??
    rules[0] ??
    null;
  const approverName = approval
    ? textOf(approval, "approver_display_name") ??
      (approved || declined ? textOf(approval, "approver_email") : null)
    : null;
  const approverRole = approval ? textOf(approval, "approver_role") : null;
  const approvalReason = approval ? textOf(approval, "reason") : null;

  return describeDecision({
    outcome:
      bankOutcome === "hold" && declined
        ? "declined"
        : bankOutcome === "hold" && approved
          ? "released"
          : bankOutcome,
    product: textOf(bank, "product"),
    event_type: textOf(bank, "event_type"),
    amount: numOf(attrs.amount ?? attrs.amount_rwf ?? attrs.loan_amount),
    currency: textOf(attrs, "currency"),
    policy_version:
      typeof bank.policy_version === "number" || typeof bank.policy_version === "string"
        ? bank.policy_version
        : null,
    matched_rules: rules.map((rule_id) => ({ rule_id })),
    decided_by_rule_id: decided,
    decision_basis:
      bank.decision_basis && typeof bank.decision_basis === "object"
        ? (bank.decision_basis as Parameters<typeof describeDecision>[0]["decision_basis"])
        : null,
    required_role: textOf(bank, "required_role"),
    required_role_label: textOf(bank, "required_role_label"),
    approver_name: approved || declined ? approverName : null,
    approver_role: approved || declined ? approverRole : null,
    approved_at: approved || declined ? approvalAt : null,
    approval_reason: approved || declined ? approvalReason : null,
    mode: textOf(bank, "mode"),
    would_have: textOf(bank, "would_have"),
  });
}

function storyFromTrace(steps: TraceStep[]): {
  what_happened: string;
  description: string | null;
  data_seen: string | null;
  fields: string[];
  policy_decision: string;
  policy_reason: string | null;
  anomaly: string | null;
  status: string;
  approver: string | null;
  rule_label: string | null;
} {
  const fields: string[] = [];
  let anomalyType: string | null = null;
  let anomalyReason: string | null = null;
  let anomalyFlagged = false;
  let policyDecision = "allow";
  let policyReason: string | null = null;
  let task: string | null = null;
  let description: string | null = null;
  let genericSubject: string | null = null;
  let emailSubject: string | null = null;
  let emailCase = false;
  let denied = false;
  let needsPerson = false;
  let bankOutcome: string | null = null;
  let approver: string | null = null;
  let ruleLabel: string | null = null;
  let humanDecided = false;

  for (const step of steps) {
    const payload =
      step.payload && typeof step.payload === "object"
        ? (step.payload as Record<string, unknown>)
        : {};
    pushFieldNames(fields, payload.fields_accessed);
    pushFieldNames(fields, payload.data_touched);
    pushFieldNames(fields, payload.fields);
    const context = payload.evaluation_context;
    if (context && typeof context === "object" && !Array.isArray(context)) {
      pushFieldNames(fields, (context as Record<string, unknown>).fields_accessed);
    }
    if (isEmailSourced(payload)) emailCase = true;
    task = task ?? textOf(payload, "task");
    // Prefer sealed summary only when it is not engine jargon.
    const summary = textOf(payload, "summary");
    if (
      summary &&
      !/^governed decision\b/i.test(summary) &&
      !summary.includes("governed.action") &&
      !summary.includes("policy_decision")
    ) {
      description = description ?? summary;
    }
    genericSubject =
      genericSubject ??
      textOf(payload, "subject") ??
      textOf(payload, "business_context") ??
      textOf(payload, "trigger_detail");
    emailSubject = emailSubject ?? textOf(payload, "email_subject");
    if (step.action_kind === "anomaly_signal") {
      anomalyFlagged = true;
      anomalyType = textOf(payload, "type") ?? anomalyType;
      anomalyReason = textOf(payload, "reason") ?? anomalyReason;
    }
    if (step.action_kind === "policy_decision") {
      policyDecision = step.policy_decision || policyDecision;
      if (isBankPayload(payload)) {
        bankOutcome = textOf(payload, "outcome") ?? bankOutcome;
        const decided =
          textOf(payload, "decided_by_rule_id") ??
          (payload.decision_basis &&
          typeof payload.decision_basis === "object" &&
          typeof (payload.decision_basis as { decided_by_rule_id?: unknown })
            .decided_by_rule_id === "string"
            ? String(
                (payload.decision_basis as { decided_by_rule_id: string })
                  .decided_by_rule_id,
              )
            : null);
        ruleLabel = formatRuleLabel(decided, bankOutcome) ?? ruleLabel;
        // Never use investor_summary ("Governed decision …") as the reason.
        policyReason = textOf(payload, "reason") ?? policyReason;
      } else {
        const inv = textOf(payload, "investor_summary");
        policyReason =
          textOf(payload, "reason") ??
          (inv && !/^governed decision\b/i.test(inv) ? inv : null) ??
          policyReason;
      }
    }
    if (step.action_kind === "human_approval") {
      humanDecided = true;
      const name =
        textOf(payload, "approver_display_name") ??
        textOf(payload, "approver_email");
      const role = textOf(payload, "approver_role");
      approver = formatApprover(name, role) ?? name ?? approver;
      needsPerson = false;
      const decision = textOf(payload, "decision");
      if (decision === "rejected" || decision === "declined" || decision === "denied") {
        denied = true;
      }
    }
    if (step.policy_decision === "deny" && step.action_kind !== "human_approval") {
      denied = true;
    }
    if (step.policy_decision === "allow_with_obligation" && !humanDecided) {
      needsPerson = true;
    }
  }

  const decisionText = decisionTextFromSteps(steps);
  if (decisionText) {
    description = decisionText;
    policyReason = decisionText;
  }

  const anomaly = anomalyFlagged
    ? anomalySentence(anomalyType, anomalyReason)
    : null;
  const dataSeen = seenSentence(fields);
  let status = "Completed";
  if (denied) status = "Stopped";
  else if (needsPerson) status = "Needs approval";
  else if (anomaly) status = "Needs attention";

  const outcomeKey = bankOutcome ?? policyDecision;
  const policyLabel =
    denied || outcomeKey === "deny" || outcomeKey === "stop" || outcomeKey === "declined"
      ? "Stopped"
      : needsPerson || outcomeKey === "hold" || outcomeKey === "allow_with_obligation"
        ? "Needs approval"
        : humanDecided
          ? OUTCOME_LABELS.released ?? "Approved"
          : outcomeKey === "allow"
            ? "Allowed"
            : OUTCOME_LABELS[outcomeKey] ?? "Allowed";

  const labels = [...new Set(fields.map(humanField).filter(Boolean))];
  const subject =
    task ??
    genericSubject ??
    (emailCase ? emailSubject : null);
  // Never fall back to engine tool/action ids in the title.
  const what =
    decisionText ??
    subject ??
    (anomaly ? "This case was flagged." : "This case was recorded.");

  return {
    what_happened: what,
    description: description ?? decisionText,
    data_seen: dataSeen,
    fields: labels,
    policy_decision: policyLabel,
    policy_reason: policyReason ?? decisionText,
    anomaly,
    status,
    approver,
    rule_label: ruleLabel,
  };
}

/** Scoped read-only auditor portal (Phase 5). */
publicRoutes.get("/auditor/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) return c.json({ error: "token required" }, 422);
  const client = await getPool().connect();
  try {
    const invite = await client.query<{
      invite_id: string;
      organization_id: string;
      email: string;
      expires_at: Date;
      revoked_at: Date | null;
      workflow_ids: unknown;
      period_start: Date | null;
      period_end: Date | null;
      org_name: string;
    }>(
      `SELECT i.invite_id, i.organization_id, i.email, i.expires_at, i.revoked_at,
              i.workflow_ids, i.period_start, i.period_end, o.name AS org_name
       FROM auditor_invite i
       JOIN organization o ON o.organization_id = i.organization_id
       WHERE i.token_hash = $1
       LIMIT 1`,
      [hashToken(token)],
    );
    const row = invite.rows[0];
    if (!row || row.revoked_at || row.expires_at < new Date()) {
      return c.json({ error: "Invite invalid or expired" }, 404);
    }

    await client.query(
      `INSERT INTO auditor_access_log (
         log_id, invite_id, organization_id, action, resource_type, resource_id
       ) VALUES ($1,$2,$3,'portal.view','auditor_invite',$2)`,
      [`alog_${randomUUID().replace(/-/g, "").slice(0, 16)}`, row.invite_id, row.organization_id],
    );

    const periodStart = row.period_start ?? new Date(Date.now() - 90 * 86_400_000);
    const periodEnd = row.period_end ?? new Date();
    const traces = await client.query<{
      trace_id: string;
      agent_id: string;
      started_at: Date;
      status: string;
      total_events: number;
    }>(
      `SELECT trace_id, agent_id, started_at, status, total_events
       FROM trace
       WHERE organization_id = $1
         AND started_at >= $2 AND started_at <= $3
       ORDER BY started_at DESC
       LIMIT 50`,
      [row.organization_id, periodStart, periodEnd],
    );

    return c.json({
      portal: {
        organization_name: row.org_name,
        email: row.email,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        workflow_ids: Array.isArray(row.workflow_ids) ? row.workflow_ids : [],
        read_only: true,
      },
      traces: traces.rows.map((t) => ({
        trace_id: t.trace_id,
        agent_id: t.agent_id,
        started_at: t.started_at.toISOString(),
        status: t.status,
        total_events: t.total_events,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("auditor_invite") || message.includes("does not exist")) {
      return c.json({ error: "Auditor portal unavailable" }, 503);
    }
    throw error;
  } finally {
    client.release();
  }
});

publicRoutes.get("/orgs/:slug/transparency/head", async (c) => {
  const slug = c.req.param("slug");
  const client = await getPool().connect();
  try {
    const org = await client.query<{ organization_id: string }>(
      `SELECT organization_id FROM organization WHERE slug = $1`,
      [slug],
    );
    const organizationId = org.rows[0]?.organization_id;
    if (!organizationId) {
      return c.json({ error: "Not found" }, 404);
    }

    const head = await client.query<{
      tree_size: string;
      latest_log_index: string | null;
      latest_leaf_hash: string | null;
      latest_published_at: Date | null;
    }>(
      `SELECT
         COUNT(*)::text AS tree_size,
         MAX(log_index)::text AS latest_log_index,
         (SELECT leaf_hash FROM transparency_log_entry t2
          WHERE t2.organization_id = $1
          ORDER BY log_index DESC LIMIT 1) AS latest_leaf_hash,
         MAX(published_at) AS latest_published_at
       FROM transparency_log_entry
       WHERE organization_id = $1`,
      [organizationId],
    );

    const row = head.rows[0];
    return c.json({
      organization_slug: slug,
      tree_size: Number(row?.tree_size ?? 0),
      latest_log_index:
        row?.latest_log_index != null ? Number(row.latest_log_index) : null,
      latest_leaf_hash: row?.latest_leaf_hash ?? null,
      latest_published_at: row?.latest_published_at ?? null,
    });
  } finally {
    client.release();
  }
});

publicRoutes.get("/orgs/:slug/verify/:eventId", async (c) => {
  const slug = c.req.param("slug");
  const eventId = c.req.param("eventId");
  const client = await getPool().connect();
  try {
    const bundle = await buildPublicVerificationBundle(client, slug, eventId);
    if (!bundle) {
      const org = await client.query<{ organization_id: string }>(
        `SELECT organization_id FROM organization WHERE slug = $1`,
        [slug],
      );
      const organizationId = org.rows[0]?.organization_id;
      if (!organizationId) {
        return c.json({ error: "Organization not found", code: "org_not_found" }, 404);
      }
      const event = await client.query<{ event_id: string }>(
        `SELECT event_id FROM event WHERE organization_id = $1 AND event_id = $2`,
        [organizationId, eventId],
      );
      if (!event.rows[0]) {
        return c.json({ error: "Event not found", code: "event_not_found" }, 404);
      }
      const witnessed = await client.query<{ event_id: string }>(
        `SELECT event_id FROM inclusion_proof
         WHERE organization_id = $1 AND event_id = $2`,
        [organizationId, eventId],
      );
      if (!witnessed.rows[0]) {
        return c.json(
          {
            error:
              "This event is sealed. Witness inclusion is still processing. Try again in about a minute.",
            code: "witness_pending",
          },
          404,
        );
      }
      return c.json(
        {
          error:
            "This event is witnessed. Transparency log publish is still processing. Try again in about a minute.",
          code: "transparency_pending",
        },
        404,
      );
    }
    const includeVerification =
      c.req.query("verify") === "1" || c.req.query("include") === "verification";
    if (includeVerification) {
      // Stage 2: say where the data came from next to the seal check. The seal check is about
      // the record; the source line is about the data. They are never merged into one "verified".
      let provenance = null;
      try {
        const org = await client.query<{ organization_id: string }>(
          `SELECT organization_id FROM organization WHERE slug = $1`,
          [slug],
        );
        const organizationId = org.rows[0]?.organization_id;
        if (organizationId) {
          provenance = await loadProvenanceForEvent(client, organizationId, eventId);
        }
      } catch {
        provenance = null;
      }
      return c.json({
        ...bundle,
        verification: verifyPublicVerificationBundle(bundle),
        provenance,
      });
    }
    return c.json(bundle);
  } finally {
    client.release();
  }
});

/**
 * Expiring read-only receipt share (Phase 8).
 * Opaque token → sealed receipt summary without console login.
 */
publicRoutes.get("/share/receipt/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) return c.json({ error: "token required" }, 422);

  const client = await getPool().connect();
  try {
    const share = await client.query<{
      share_id: string;
      organization_id: string;
      event_id: string;
      expires_at: Date;
      revoked_at: Date | null;
      org_name: string;
      org_slug: string;
    }>(
      `SELECT s.share_id, s.organization_id, s.event_id, s.expires_at, s.revoked_at,
              o.name AS org_name, o.slug AS org_slug
       FROM receipt_share_token s
       JOIN organization o ON o.organization_id = s.organization_id
       WHERE s.token_hash = $1
       LIMIT 1`,
      [hashToken(token)],
    );
    const row = share.rows[0];
    if (!row || row.revoked_at || row.expires_at < new Date()) {
      return c.json({ error: "Share link invalid or expired" }, 404);
    }

    await client.query(
      `UPDATE receipt_share_token
       SET last_accessed_at = now(), access_count = access_count + 1
       WHERE share_id = $1`,
      [row.share_id],
    );

    const event = await client.query<{
      event_id: string;
      trace_id: string;
      agent_id: string;
      action_kind: string;
      policy_decision: string;
      tool_name: string | null;
      event_hash: string;
      prev_event_hash: string | null;
      chain_valid: boolean;
      emitted_at: Date;
      payload: unknown;
    }>(
      `SELECT event_id, trace_id, agent_id, action_kind, policy_decision, tool_name,
              event_hash, prev_event_hash, chain_valid, emitted_at, payload
       FROM event
       WHERE organization_id = $1 AND event_id = $2
       LIMIT 1`,
      [row.organization_id, row.event_id],
    );
    const ev = event.rows[0];
    if (!ev) {
      return c.json({ error: "Receipt not found" }, 404);
    }

    const payload =
      ev.payload && typeof ev.payload === "object"
        ? (ev.payload as Record<string, unknown>)
        : {};
    await auditReceiptAccess(
      client,
      { organizationId: row.organization_id, membershipId: null, email: null },
      {
        action: RECEIPT_ACCESS_ACTIONS.shareOpened,
        resourceId: row.share_id,
        resourceType: "receipt_share",
        metadata: {
          event_id: row.event_id,
          trace_id: ev.trace_id,
          case_id: caseIdFromPayload(payload),
          via: "share_link",
        },
      },
    );

    const amountRaw = payload.amount_usd ?? payload.amount;
    const amountUsd =
      typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string" && amountRaw.trim() !== ""
          ? Number(amountRaw)
          : null;
    const reason =
      (typeof payload.reason === "string" && payload.reason) ||
      (typeof payload.investor_summary === "string" && payload.investor_summary) ||
      null;
    const approver =
      (typeof payload.approver_email === "string" && payload.approver_email) ||
      (typeof payload.approver === "string" && payload.approver) ||
      null;

    const siblings = await client.query<TraceStep>(
      `SELECT action_kind, policy_decision, tool_name, payload, emitted_at
       FROM event
       WHERE organization_id = $1 AND trace_id = $2
       ORDER BY sequence_num ASC`,
      [row.organization_id, ev.trace_id],
    );
    const story = storyFromTrace(siblings.rows);
    const agent = await client.query<{ name: string }>(
      `SELECT COALESCE(NULLIF(display_name, ''), slug, agent_id) AS name
       FROM agent
       WHERE organization_id = $1 AND agent_id = $2
       LIMIT 1`,
      [row.organization_id, ev.agent_id],
    );

    // Stage 2: where the data came from (separate from the seal check below).
    let provenance = null;
    try {
      provenance = await loadProvenanceForEvent(client, row.organization_id, row.event_id);
    } catch {
      provenance = null;
    }

    let verification: {
      status: "valid" | "pending" | "unavailable";
      detail: string;
      inclusion_status?: "ok" | "pending" | "unavailable";
      inclusion_detail?: string | null;
    } = {
      status: ev.chain_valid ? "valid" : "unavailable",
      detail: ev.chain_valid
        ? "Signature chain is intact."
        : "Public cryptographic bundle not built for this receipt yet.",
      inclusion_status: "pending",
      inclusion_detail: ev.chain_valid
        ? "Witness or transparency inclusion may still be processing."
        : null,
    };
    try {
      const bundle = await buildPublicVerificationBundle(
        client,
        row.org_slug,
        row.event_id,
      );
      if (bundle) {
        const checked = verifyPublicVerificationBundle(bundle);
        verification = {
          status: checked.ok || ev.chain_valid ? "valid" : "unavailable",
          detail: checked.ok
            ? "Witness and transparency log entries match this record."
            : ev.chain_valid
              ? "Signature chain is intact."
              : checked.errors.join("; ") || "Record check failed.",
          inclusion_status: checked.ok ? "ok" : "unavailable",
          inclusion_detail: checked.ok
            ? null
            : checked.errors.join("; ") || "Inclusion check failed.",
        };
      } else if (ev.chain_valid) {
        verification = {
          status: "valid",
          detail: "Signature chain is intact.",
          inclusion_status: "pending",
          inclusion_detail:
            "Witness or transparency inclusion may still be processing.",
        };
      }
    } catch {
      /* keep chain-based fallback above */
    }

    return c.json({
      share: {
        share_id: row.share_id,
        expires_at: row.expires_at.toISOString(),
        read_only: true,
        organization_name: row.org_name,
        organization_slug: row.org_slug,
      },
      receipt: {
        event_id: ev.event_id,
        trace_id: ev.trace_id,
        agent_id: ev.agent_id,
        // Keep engine fields for verify tooling; share UI must not render them raw.
        action_kind: ev.action_kind,
        policy_decision: ev.policy_decision,
        tool_name:
          ev.tool_name === "governed.action" || ev.tool_name === "policy_decision"
            ? null
            : ev.tool_name,
        event_hash: ev.event_hash,
        prev_event_hash: ev.prev_event_hash,
        chain_valid: ev.chain_valid,
        emitted_at: ev.emitted_at.toISOString(),
        amount_usd: Number.isFinite(amountUsd) ? amountUsd : null,
        reason: story.policy_reason ?? reason,
        approver: story.approver ?? approver,
        decision: story.policy_decision,
        agent_name: agent.rows[0]?.name ?? ev.agent_id,
      },
      story,
      verification,
      provenance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("receipt_share_token") ||
      message.includes("does not exist")
    ) {
      return c.json({ error: "Share links unavailable" }, 503);
    }
    throw error;
  } finally {
    client.release();
  }
});

publicRoutes.get("/agents/:agentId/did", async (c) => {
  const agentId = c.req.param("agentId");
  const client = await getPool().connect();
  try {
    const doc = await getDidDocumentByAgent(client, agentId);
    if (!doc) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      agent_id: doc.agent_id,
      organization_id: doc.organization_id,
      document: doc.document_json,
      published_at: doc.published_at,
    });
  } finally {
    client.release();
  }
});

publicRoutes.get("/did/:did", async (c) => {
  const did = decodeURIComponent(c.req.param("did"));
  const client = await getPool().connect();
  try {
    const doc = await getDidDocumentByDid(client, did);
    if (!doc) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(doc.document_json);
  } finally {
    client.release();
  }
});
