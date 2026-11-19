import { Hono } from "hono";
import {
  canDecideApprovals,
  type ConsoleSession,
} from "@salanor/platform-auth";
import type pg from "pg";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { ingestHumanApprovalEvent } from "../../console/human-approval-event.js";
import { issueApprovalOutcomeReceipt } from "../../forensic/issue-approval-outcome.js";
import { buildRequestPreview } from "../../approvals/request-preview.js";
import {
  assertApprovedViewFresh,
  buildApproverBinding,
  hashApprovedView,
  loadSsoSubjectForAccount,
  type ApproverBinding,
} from "../../approvals/approver-binding.js";
import {
  askMoreOnApproval,
  decideApproval,
  expireStaleApprovals,
  getApprovalRich,
  listPendingApprovals,
  listRecentApprovalsPaginated,
  reassignApproval,
  type ApprovalRichDetail,
} from "../../repo/approvals.js";
import {
  applyEscalateToRoleMetadata,
  guardConsoleApprovalDecision,
  type ApprovalDecisionBody,
} from "../../bank/console-approval-guard.js";
import { roleSatisfies } from "../../bank/authority-matrix.js";
import { escalateDueApprovals } from "../../bank/escalation.js";
import {
  findDelegationRelied,
  type DelegationRecord,
} from "../../bank/approval-delegate.js";
import {
  listMembershipBankRoles,
  loadBankApprovalRoleContext,
} from "../../bank/repo.js";
import { resolveActingBankRole } from "../../bank/resolve-acting-role.js";
import { extractRequester } from "../../bank/requester.js";
import { isOrganizationDemo } from "../../bank/demo-tenant.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { isBridgeMasterKeyConfigured } from "../../crypto/bridge-key-vault.js";
import { getOrCreateApprovalSigningKeyId } from "../../repo/signing-keys.js";
import { verifyApprovalActionToken } from "../../approvals/action-token.js";
import { getGovernanceSettings } from "../../repo/governance-settings.js";
import { dispatchOrgWebhookEvent } from "../../webhooks/dispatch.js";
import { nowIso } from "../../time/clock.js";

/**
 * Demo seed may pass a historical decided_at so approval receipts are minutes/hours
 * after the hold. Non-demo orgs always use wall clock. Never accept a future stamp.
 */
async function resolveDecidedAtForOrg(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  raw: string | undefined,
): Promise<string> {
  const fallback = nowIso();
  if (!raw?.trim()) return fallback;
  if (!(await isOrganizationDemo(client, organizationId))) return fallback;
  const ms = Date.parse(raw.trim());
  if (!Number.isFinite(ms)) return fallback;
  if (ms > Date.now() + 60_000) return fallback;
  return new Date(ms).toISOString();
}

/** Expire stale approvals, then raise any whose configured escalation window has elapsed. */
async function expireAndEscalate(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<number> {
  const expired = await expireStaleApprovals(client, organizationId);
  await escalateDueApprovals(client, organizationId);
  return expired;
}

const BRIDGE_KEY_SETUP_ERROR =
  "AEGIS_BRIDGE_MASTER_KEY is not configured on aegis-api. Add a 32-byte secret (base64 or hex) to the repo-root .env and restart aegis-api.";

function requestPreview(payload: Record<string, unknown> | null) {
  return buildRequestPreview(payload);
}

function bridgeMasterKeyMissingResponse(c: {
  json: (body: { error: string }, status: 503) => Response;
}) {
  return c.json({ error: BRIDGE_KEY_SETUP_ERROR }, 503);
}

function serializeApproval(row: ApprovalRichDetail) {
  const preview = requestPreview(row.event_payload);
  const metadata =
    row.metadata && typeof row.metadata === "object" ? row.metadata : null;
  const votes = Array.isArray(metadata?.votes) ? metadata.votes : [];
  return {
    approval_id: row.approval_id,
    event_id: row.event_id,
    status: row.status,
    trace_id: row.trace_id,
    tool_name: row.tool_name,
    agent_id: row.agent_id,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null,
    decided_at: row.decided_at?.toISOString() ?? null,
    approver_email: row.approver_email,
    policy_reason: row.policy_reason,
    request_preview: preview,
    /** Echo this on approve so a stale console view is refused. */
    approved_view_hash: hashApprovedView(preview),
    metadata,
    vote_count: votes.length,
  };
}

function serializeApprovalDetail(row: ApprovalRichDetail) {
  return {
    ...serializeApproval(row),
    event_payload: row.event_payload,
  };
}

async function finalizeHumanApproval(
  client: Parameters<typeof decideApproval>[0],
  params: {
    organizationId: string;
    approvalId: string;
    userId: string;
    email: string;
    displayName?: string | null;
    role?: string | null;
    decision: "approved" | "rejected";
    reason?: string;
    /** Set when the approver relied on a time-bound delegation (not a permanent role). */
    delegation?: DelegationRecord | null;
    /** Sealed into the outcome receipt (demo seed may pass a historical stamp). */
    decidedAt?: string;
    approvedViewHash?: string | null;
    viewConfirmation?:
      | "confirmed_by_approver"
      | "server-rendered, not confirmed by approver"
      | null;
    approverBinding?: ApproverBinding | null;
  },
) {
  const decided = await decideApproval(
    client,
    params.organizationId,
    params.approvalId,
    params.userId,
    params.decision,
    {
      reason: params.reason,
      voterEmail: params.email,
      delegation: params.delegation ?? null,
      binding: params.approverBinding
        ? (params.approverBinding as unknown as Record<string, unknown>)
        : null,
      view_confirmation: params.viewConfirmation ?? null,
    },
  );
  if (!decided) return null;

  if (decided.finalized) {
    const decidedAt = params.decidedAt?.trim() || nowIso();
    const approvalKeyId = await getOrCreateApprovalSigningKeyId(
      client,
      params.organizationId,
      decided.detail.agent_id,
      decided.detail.key_id,
    );
    const rich = await getApprovalRich(
      client,
      params.organizationId,
      params.approvalId,
    );
    const payload =
      rich?.event_payload && typeof rich.event_payload === "object"
        ? rich.event_payload
        : null;
    const requiredRole =
      typeof rich?.metadata?.required_role === "string"
        ? rich.metadata.required_role
        : null;
    const { roleKey: actingRole } = await resolveActingBankRole(
      client,
      params.organizationId,
      params.userId,
      {
        delegationRoleKey: params.delegation?.role_key,
        requiredRole,
      },
    );
    const approvedViewHash =
      params.approvedViewHash?.trim() ||
      hashApprovedView(requestPreview(payload));
    const viewConfirmation =
      params.viewConfirmation ??
      "server-rendered, not confirmed by approver";
    const voteBindings = collectVoteBindings(rich?.metadata);
    const approverBindings =
      voteBindings.length > 0
        ? voteBindings
        : params.approverBinding
          ? [params.approverBinding]
          : [];
    const requester = extractRequester(payload);
    const persisted = await ingestHumanApprovalEvent(client, {
      organizationId: params.organizationId,
      traceId: decided.detail.trace_id,
      agentId: decided.detail.agent_id,
      keyId: approvalKeyId,
      parentEventId: decided.detail.event_id,
      approverEmail: params.email,
      approverUserId: params.userId,
      approverDisplayName: params.displayName ?? null,
      approverRole: actingRole,
      approvalId: params.approvalId,
      decision: params.decision,
      toolName: decided.detail.tool_name ?? undefined,
      reason: params.reason,
      requesterEmail: requester.email,
      requesterOfficerId: requester.officer_id,
      delegation: params.delegation ?? null,
      emitted_at: decidedAt,
    });
    await issueApprovalOutcomeReceipt(client, {
      organizationId: params.organizationId,
      approvalId: params.approvalId,
      outcome: params.decision === "approved" ? "approved" : "declined",
      gateEventId: decided.detail.event_id,
      humanEventId: persisted.eventId,
      humanEventHash: persisted.eventHash,
      humanEventSeq: persisted.sequenceNum,
      approver: {
        user_id: params.userId,
        display_name: params.displayName ?? null,
        email: params.email,
        role: actingRole,
      },
      reason: params.reason ?? null,
      decided_at: decidedAt,
      eventPayload: payload,
      delegation: params.delegation ?? null,
      approved_view_hash: approvedViewHash,
      view_confirmation: viewConfirmation,
      approver_binding: params.approverBinding ?? null,
      approver_bindings: approverBindings,
    });
  }

  return decided;
}

function collectVoteBindings(
  metadata: Record<string, unknown> | null | undefined,
): ApproverBinding[] {
  if (!metadata || !Array.isArray(metadata.votes)) return [];
  const out: ApproverBinding[] = [];
  for (const vote of metadata.votes) {
    if (!vote || typeof vote !== "object" || Array.isArray(vote)) continue;
    const binding = (vote as Record<string, unknown>).binding;
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      continue;
    }
    out.push(binding as ApproverBinding);
  }
  return out;
}

async function bindingForSession(
  client: pg.PoolClient,
  session: ConsoleSession,
  roleKey: string | null,
  stepUpMfa: boolean,
): Promise<ApproverBinding> {
  const ssoSubject = await loadSsoSubjectForAccount(client, session.accountId);
  return buildApproverBinding({
    accountId: session.accountId,
    membershipId: session.userId,
    sessionId: session.sessionId,
    roleKey,
    ssoSubject,
    stepUpMfa,
  });
}

async function refuseIfStaleView(
  client: pg.PoolClient,
  organizationId: string,
  approvalId: string,
  clientHash: string | null | undefined,
): Promise<
  | {
      ok: true;
      currentHash: string;
      viewConfirmation:
        | "confirmed_by_approver"
        | "server-rendered, not confirmed by approver";
    }
  | { ok: false; code: string; message: string }
> {
  const rich = await getApprovalRich(client, organizationId, approvalId);
  const payload =
    rich?.event_payload && typeof rich.event_payload === "object"
      ? rich.event_payload
      : null;
  const currentHash = hashApprovedView(requestPreview(payload));
  const fresh = assertApprovedViewFresh(currentHash, clientHash);
  if (!fresh.ok) return fresh;
  return {
    ok: true,
    currentHash,
    viewConfirmation: fresh.viewConfirmation,
  };
}

/**
 * If the approver only satisfies the required role through an active delegation,
 * return that delegation so both names land on the vote and the signed receipt.
 */
async function delegationRelied(
  client: pg.PoolClient,
  session: ConsoleSession,
  approvalId: string,
): Promise<DelegationRecord | null> {
  const rich = await getApprovalRich(client, session.organizationId, approvalId);
  const requiredRole =
    typeof rich?.metadata?.required_role === "string" ? rich.metadata.required_role : null;
  if (!requiredRole) return null;
  const ctx = await loadBankApprovalRoleContext(
    client,
    session.organizationId,
    session.userId,
  );
  if (!ctx.available) return null;
  const permanent = await listMembershipBankRoles(
    client,
    session.organizationId,
    session.userId,
  );
  return findDelegationRelied(client, {
    organizationId: session.organizationId,
    membershipId: session.userId,
    requiredRole,
    permanentRoles: permanent,
    satisfies: (actorRole, required) => roleSatisfies(ctx.ladder, actorRole, required),
  });
}

function emitApprovalDecidedWebhook(
  organizationId: string,
  decided: NonNullable<Awaited<ReturnType<typeof finalizeHumanApproval>>>,
  decision: "approved" | "rejected",
  approverEmail: string,
  reason?: string,
) {
  if (!decided.finalized) {
    return;
  }
  dispatchOrgWebhookEvent(getPool(), organizationId, "approval.decided", {
    approval_id: decided.detail.approval_id,
    event_id: decided.detail.event_id,
    trace_id: decided.detail.trace_id,
    agent_id: decided.detail.agent_id,
    tool_name: decided.detail.tool_name,
    decision,
    approver_email: approverEmail,
    reason: reason ?? null,
    decided_at: decided.detail.decided_at?.toISOString() ?? new Date().toISOString(),
  });
}

/** Run bank/SoD/required-field guard; on deny write audit_log (caller commits). */
async function enforceApprovalGuard(
  client: pg.PoolClient,
  session: ConsoleSession,
  approvalId: string,
  action: "approve" | "reject" | "release",
  body: ApprovalDecisionBody,
) {
  const guard = await guardConsoleApprovalDecision(client, {
    organizationId: session.organizationId,
    membershipId: session.userId,
    email: session.email,
    approvalId,
    action,
    body,
  });
  if (!guard.ok) {
    await auditFromConsoleSession(client, session, {
      action: "approval.guard_denied",
      resourceType: "approval",
      resourceId: approvalId,
      metadata: {
        code: guard.code,
        message: guard.message,
        decision_action: action,
      },
    });
  }
  return guard;
}

export const approvalRoutes = new Hono<{ Variables: ConsoleVariables }>();

approvalRoutes.get("/approvals", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const status = c.req.query("status") ?? "pending";
  const envRaw = c.req.query("environment");
  const environment = envRaw === "sandbox" ? "sandbox" : "production";

  if (status === "history") {
    const limit = Math.min(Math.max(Number(c.req.query("limit") || "25"), 1), 100);
    const offset = Math.max(Number(c.req.query("offset") || "0"), 0);
    const decisionRaw = c.req.query("decision") ?? "all";
    const decision =
      decisionRaw === "approved" ||
      decisionRaw === "rejected" ||
      decisionRaw === "expired" ||
      decisionRaw === "all"
        ? decisionRaw
        : "all";
    const tool = c.req.query("tool") ?? undefined;
    const result = await listRecentApprovalsPaginated(getPool(), orgId, {
      limit,
      offset,
      decision,
      tool,
      environment,
    });
    return c.json({
      approvals: result.rows.map(serializeApproval),
      total: result.total,
      limit,
      offset,
      environment,
    });
  }

  if (status !== "pending") {
    return c.json({ error: "Use status=pending or status=history" }, 422);
  }

  await expireAndEscalate(getPool(), orgId);
  const rows = await listPendingApprovals(getPool(), orgId, environment);
  const governance = await getGovernanceSettings(getPool(), orgId);
  const blocked = rows.length;
  return c.json({
    approvals: rows.map(serializeApproval),
    blocked_traces: blocked,
    required_approvers: governance.required_approvers,
    environment,
  });
});

/** Slack URL-button decide (signed token encodes approve/decline). */
approvalRoutes.post("/approvals/act", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (!canDecideApprovals(session, session.organizationId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (!isBridgeMasterKeyConfigured()) {
    return bridgeMasterKeyMissingResponse(c);
  }

  let body: { token?: string; reason?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const claims = body.token ? verifyApprovalActionToken(body.token) : null;
  if (!claims) {
    return c.json({ error: "Invalid or expired Slack approval link" }, 400);
  }
  if (claims.organizationId !== session.organizationId) {
    return c.json({ error: "This link belongs to another organization" }, 403);
  }
  if (claims.decision === "rejected" && !body.reason?.trim()) {
    return c.json({ error: "Reason required to Decline" }, 422);
  }

  const approvalId = claims.approvalId;
  const decisionBody: ApprovalDecisionBody = {
    reason: body.reason,
  };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await expireAndEscalate(client, session.organizationId);
    const guard = await enforceApprovalGuard(
      client,
      session,
      approvalId,
      claims.decision === "approved" ? "approve" : "reject",
      decisionBody,
    );
    if (!guard.ok) {
      await client.query("COMMIT");
      return c.json({ error: guard.message, code: guard.code }, 403);
    }
    const viewCheck = await refuseIfStaleView(
      client,
      session.organizationId,
      approvalId,
      undefined,
    );
    const richForRole = await getApprovalRich(
      client,
      session.organizationId,
      approvalId,
    );
    const requiredRole =
      typeof richForRole?.metadata?.required_role === "string"
        ? richForRole.metadata.required_role
        : null;
    const { roleKey: actingRole } = await resolveActingBankRole(
      client,
      session.organizationId,
      session.userId,
      { requiredRole },
    );
    const approverBinding = await bindingForSession(
      client,
      session,
      actingRole,
      false,
    );
    const decided = await finalizeHumanApproval(client, {
      organizationId: session.organizationId,
      approvalId,
      userId: session.userId,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
      decision: claims.decision,
      reason: body.reason?.trim(),
      approvedViewHash: viewCheck.ok ? viewCheck.currentHash : undefined,
      viewConfirmation: viewCheck.ok ? viewCheck.viewConfirmation : undefined,
      approverBinding,
    });
    if (!decided) {
      await client.query("ROLLBACK");
      return c.json({ error: "Not found, expired, or not pending" }, 404);
    }

    await auditFromConsoleSession(client, session, {
      action:
        claims.decision === "approved"
          ? "approval.approved_via_slack_link"
          : "approval.rejected_via_slack_link",
      resourceType: "approval",
      resourceId: approvalId,
      metadata: {
        trace_id: decided.detail.trace_id,
        event_id: decided.detail.event_id,
        reason: body.reason?.trim() ?? null,
        finalized: decided.finalized,
        votes: decided.votes,
        required: decided.required,
      },
    });

    const rich = await getApprovalRich(client, session.organizationId, approvalId);
    await client.query("COMMIT");
    emitApprovalDecidedWebhook(
      session.organizationId,
      decided,
      claims.decision,
      session.email,
      body.reason?.trim(),
    );
    return c.json({
      approval: rich ? serializeApproval(rich) : null,
      finalized: decided.finalized,
      votes: decided.votes,
      required: decided.required,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

approvalRoutes.get("/approvals/:approvalId", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const approvalId = c.req.param("approvalId");
  if (!approvalId) {
    return c.json({ error: "approvalId required" }, 422);
  }
  const row = await getApprovalRich(getPool(), orgId, approvalId);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ approval: serializeApprovalDetail(row) });
});

approvalRoutes.post(
  "/approvals/:approvalId/approve",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canDecideApprovals(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!isBridgeMasterKeyConfigured()) {
      return bridgeMasterKeyMissingResponse(c);
    }
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }
    let body: ApprovalDecisionBody = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await expireAndEscalate(client, session.organizationId);
      const guard = await enforceApprovalGuard(
        client,
        session,
        approvalId,
        "approve",
        body,
      );
      if (!guard.ok) {
        await client.query("COMMIT");
        return c.json({ error: guard.message, code: guard.code }, 403);
      }
      const viewCheck = await refuseIfStaleView(
        client,
        session.organizationId,
        approvalId,
        body.approved_view_hash,
      );
      if (!viewCheck.ok) {
        await client.query("COMMIT");
        return c.json({ error: viewCheck.message, code: viewCheck.code }, 409);
      }
      const delegation = await delegationRelied(client, session, approvalId);
      const decidedAt = await resolveDecidedAtForOrg(
        client,
        session.organizationId,
        body.decided_at,
      );
      const richForRole = await getApprovalRich(
        client,
        session.organizationId,
        approvalId,
      );
      const requiredRole =
        typeof richForRole?.metadata?.required_role === "string"
          ? richForRole.metadata.required_role
          : null;
      const { roleKey: actingRole } = await resolveActingBankRole(
        client,
        session.organizationId,
        session.userId,
        {
          delegationRoleKey: delegation?.role_key,
          requiredRole,
        },
      );
      const approverBinding = await bindingForSession(
        client,
        session,
        actingRole,
        body.step_up_mfa === true,
      );
      const decided = await finalizeHumanApproval(client, {
        organizationId: session.organizationId,
        approvalId,
        userId: session.userId,
        email: session.email,
        displayName: session.displayName,
        role: session.role,
        decision: "approved",
        reason: body.reason?.trim() ?? body.comment?.trim(),
        delegation,
        decidedAt,
        approvedViewHash: viewCheck.currentHash,
        viewConfirmation: viewCheck.viewConfirmation,
        approverBinding,
      });
      if (!decided) {
        await client.query("ROLLBACK");
        return c.json({ error: "Not found, expired, or not pending" }, 404);
      }

      await auditFromConsoleSession(client, session, {
        action: "approval.approved",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: {
          trace_id: decided.detail.trace_id,
          event_id: decided.detail.event_id,
          reason: body.reason?.trim() ?? body.comment?.trim() ?? null,
          reason_code: body.reason_code?.trim() ?? null,
          finalized: decided.finalized,
          votes: decided.votes,
          required: decided.required,
        },
      });

      const rich = await getApprovalRich(client, session.organizationId, approvalId);
      await client.query("COMMIT");
      emitApprovalDecidedWebhook(
        session.organizationId,
        decided,
        "approved",
        session.email,
        body.reason?.trim() ?? body.comment?.trim(),
      );
      return c.json({
        approval: rich ? serializeApproval(rich) : null,
        finalized: decided.finalized,
        votes: decided.votes,
        required: decided.required,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      const message = error instanceof Error ? error.message : "Approve failed";
      if (message.includes("already recorded")) {
        return c.json({ error: message }, 409);
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

approvalRoutes.post(
  "/approvals/:approvalId/reject",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canDecideApprovals(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!isBridgeMasterKeyConfigured()) {
      return bridgeMasterKeyMissingResponse(c);
    }
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }
    let body: ApprovalDecisionBody = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    if (!body.reason?.trim()) {
      return c.json({ error: "Reason required to Decline" }, 422);
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await expireAndEscalate(client, session.organizationId);
      const guard = await enforceApprovalGuard(
        client,
        session,
        approvalId,
        "reject",
        body,
      );
      if (!guard.ok) {
        await client.query("COMMIT");
        return c.json({ error: guard.message, code: guard.code }, 403);
      }
      const viewCheck = await refuseIfStaleView(
        client,
        session.organizationId,
        approvalId,
        body.approved_view_hash,
      );
      if (!viewCheck.ok) {
        await client.query("COMMIT");
        return c.json({ error: viewCheck.message, code: viewCheck.code }, 409);
      }
      const decidedAt = await resolveDecidedAtForOrg(
        client,
        session.organizationId,
        body.decided_at,
      );
      const richForRole = await getApprovalRich(
        client,
        session.organizationId,
        approvalId,
      );
      const requiredRole =
        typeof richForRole?.metadata?.required_role === "string"
          ? richForRole.metadata.required_role
          : null;
      const { roleKey: actingRole } = await resolveActingBankRole(
        client,
        session.organizationId,
        session.userId,
        { requiredRole },
      );
      const approverBinding = await bindingForSession(
        client,
        session,
        actingRole,
        body.step_up_mfa === true,
      );
      const decided = await finalizeHumanApproval(client, {
        organizationId: session.organizationId,
        approvalId,
        userId: session.userId,
        email: session.email,
        displayName: session.displayName,
        role: session.role,
        decision: "rejected",
        reason: body.reason.trim(),
        decidedAt,
        approvedViewHash: viewCheck.currentHash,
        viewConfirmation: viewCheck.viewConfirmation,
        approverBinding,
      });
      if (!decided) {
        await client.query("ROLLBACK");
        return c.json({ error: "Not found, expired, or not pending" }, 404);
      }

      await auditFromConsoleSession(client, session, {
        action: "approval.rejected",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: {
          trace_id: decided.detail.trace_id,
          event_id: decided.detail.event_id,
          reason: body.reason.trim(),
          reason_code: body.reason_code?.trim() ?? null,
          finalized: decided.finalized,
        },
      });

      const rich = await getApprovalRich(client, session.organizationId, approvalId);
      await client.query("COMMIT");
      emitApprovalDecidedWebhook(
        session.organizationId,
        decided,
        "rejected",
        session.email,
        body.reason.trim(),
      );
      return c.json({
        approval: rich ? serializeApproval(rich) : null,
        finalized: decided.finalized,
        votes: decided.votes,
        required: decided.required,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

approvalRoutes.post(
  "/approvals/:approvalId/ask-more",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canDecideApprovals(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }
    let body: { note?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (!body.note?.trim()) {
      return c.json({ error: "Note required" }, 422);
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const detail = await askMoreOnApproval(
        client,
        session.organizationId,
        approvalId,
        session.userId,
        body.note,
      );
      if (!detail) {
        await client.query("ROLLBACK");
        return c.json({ error: "Not found or not pending" }, 404);
      }
      await auditFromConsoleSession(client, session, {
        action: "approval.ask_more",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: { note: body.note.trim() },
      });
      const rich = await getApprovalRich(client, session.organizationId, approvalId);
      await client.query("COMMIT");
      return c.json({ approval: rich ? serializeApproval(rich) : null });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

/**
 * Release a hard-stopped case/approval after role check (head_of_compliance by default).
 * Body: { reason_code, comment?, reason? }
 */
approvalRoutes.post(
  "/approvals/:approvalId/release",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canDecideApprovals(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!isBridgeMasterKeyConfigured()) {
      return bridgeMasterKeyMissingResponse(c);
    }
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }
    let body: ApprovalDecisionBody = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    if (!body.reason_code?.trim()) {
      return c.json({ error: "reason_code required for release" }, 422);
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await expireAndEscalate(client, session.organizationId);
      const rich = await getApprovalRich(
        client,
        session.organizationId,
        approvalId,
      );
      if (!rich) {
        await client.query("ROLLBACK");
        return c.json({ error: "Not found" }, 404);
      }
      const meta =
        rich.metadata && typeof rich.metadata === "object"
          ? rich.metadata
          : {};
      if (meta.hard_stop !== true && rich.status !== "rejected") {
        // Allow release when hard_stop flagged, or after a stop outcome held as pending release.
        if (meta.release_pending !== true) {
          await client.query("ROLLBACK");
          return c.json(
            {
              error: "Approval is not marked hard_stop / release_pending",
              code: "not_hard_stop",
            },
            409,
          );
        }
      }

      const guard = await enforceApprovalGuard(
        client,
        session,
        approvalId,
        "release",
        body,
      );
      if (!guard.ok) {
        await client.query("COMMIT");
        return c.json({ error: guard.message, code: guard.code }, 403);
      }

      const releaseMeta = {
        ...meta,
        hard_stop: false,
        released_at: new Date().toISOString(),
        released_by: session.email,
        release_reason_code: body.reason_code.trim(),
        release_comment: body.comment?.trim() ?? body.reason?.trim() ?? null,
      };
      await client.query(
        `UPDATE approval
         SET status = 'approved',
             decided_at = now(),
             approver_user_id = $3,
             metadata = $4::jsonb
         WHERE organization_id = $1 AND approval_id = $2
           AND status IN ('pending', 'needs_info', 'rejected')`,
        [
          session.organizationId,
          approvalId,
          session.userId,
          JSON.stringify(releaseMeta),
        ],
      );

      // Soft-update linked bank_case when present.
      try {
        await client.query(
          `UPDATE bank_case
           SET status = 'approved', updated_at = now()
           WHERE organization_id = $1
             AND (event_id = $2 OR trace_id = $3)
             AND status IN ('open', 'held', 'stopped')`,
          [
            session.organizationId,
            rich.event_id,
            rich.trace_id,
          ],
        );
      } catch {
        // bank_case may be absent on older DBs
      }

      await auditFromConsoleSession(client, session, {
        action: "approval.hard_stop_released",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: {
          reason_code: body.reason_code.trim(),
          comment: body.comment?.trim() ?? null,
        },
      });

      const approvalKeyId = await getOrCreateApprovalSigningKeyId(
        client,
        session.organizationId,
        rich.agent_id,
        rich.key_id,
      );
      const payload =
        rich.event_payload && typeof rich.event_payload === "object"
          ? rich.event_payload
          : null;
      const requiredRole =
        typeof meta.required_role === "string" ? meta.required_role : null;
      const { roleKey: releaseRole } = await resolveActingBankRole(
        client,
        session.organizationId,
        session.userId,
        { requiredRole },
      );
      const releaseReason =
        body.comment?.trim() ?? body.reason?.trim() ?? body.reason_code.trim();
      const releaseRequester = extractRequester(payload);
      const viewCheck = assertApprovedViewFresh(
        hashApprovedView(requestPreview(payload)),
        body.approved_view_hash,
      );
      if (!viewCheck.ok) {
        await client.query("COMMIT");
        return c.json({ error: viewCheck.message, code: viewCheck.code }, 409);
      }
      const approvedViewHash = hashApprovedView(requestPreview(payload));
      const approverBinding = await bindingForSession(
        client,
        session,
        releaseRole,
        body.step_up_mfa === true,
      );
      const persisted = await ingestHumanApprovalEvent(client, {
        organizationId: session.organizationId,
        traceId: rich.trace_id,
        agentId: rich.agent_id,
        keyId: approvalKeyId,
        parentEventId: rich.event_id,
        approverEmail: session.email,
        approverUserId: session.userId,
        approverDisplayName: session.displayName,
        approverRole: releaseRole,
        approvalId,
        decision: "released",
        toolName: rich.tool_name ?? undefined,
        reason: releaseReason,
        reasonCode: body.reason_code.trim(),
        requesterEmail: releaseRequester.email,
        requesterOfficerId: releaseRequester.officer_id,
      });
      await issueApprovalOutcomeReceipt(client, {
        organizationId: session.organizationId,
        approvalId,
        outcome: "released",
        gateEventId: rich.event_id,
        humanEventId: persisted.eventId,
        humanEventHash: persisted.eventHash,
        humanEventSeq: persisted.sequenceNum,
        approver: {
          user_id: session.userId,
          display_name: session.displayName,
          email: session.email,
          role: releaseRole,
        },
        reason: releaseReason,
        reason_code: body.reason_code.trim(),
        decided_at: releaseMeta.released_at,
        eventPayload: payload,
        approved_view_hash: approvedViewHash,
        approver_binding: approverBinding,
      });

      const updated = await getApprovalRich(
        client,
        session.organizationId,
        approvalId,
      );
      await client.query("COMMIT");
      return c.json({
        approval: updated ? serializeApproval(updated) : null,
        released: true,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

/**
 * Escalate a pending approval to a higher bank role (metadata.escalate_to_role).
 * Body: { escalate_to_role: string }
 */
approvalRoutes.post(
  "/approvals/:approvalId/escalate",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canDecideApprovals(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }
    let body: { escalate_to_role?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    const target = body.escalate_to_role?.trim();
    if (!target) {
      return c.json({ error: "escalate_to_role required" }, 422);
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const rich = await getApprovalRich(
        client,
        session.organizationId,
        approvalId,
      );
      if (!rich || !["pending", "needs_info"].includes(rich.status)) {
        await client.query("ROLLBACK");
        return c.json({ error: "Not found or not pending" }, 404);
      }

      const roleCtx = await loadBankApprovalRoleContext(
        client,
        session.organizationId,
        session.userId,
      );
      if (roleCtx.available) {
        const currentRequired =
          typeof rich.metadata?.required_role === "string"
            ? rich.metadata.required_role
            : null;
        // Actor must satisfy current required role (or have any bank role if unset)
        // and the target must be strictly higher on the ladder when current is set.
        if (currentRequired) {
          const canAct = session.role === "admin" || session.role === "owner"
            || roleCtx.actorRoles.some((r) =>
              roleSatisfies(roleCtx.ladder, r, currentRequired),
            );
          if (!canAct) {
            await client.query("COMMIT");
            return c.json(
              { error: "Insufficient role to escalate", code: "insufficient_role" },
              403,
            );
          }
          const currentLevel =
            roleCtx.ladder.find((r) => r.role_key === currentRequired)?.level ?? 0;
          const targetLevel =
            roleCtx.ladder.find((r) => r.role_key === target)?.level;
          if (targetLevel == null || targetLevel <= currentLevel) {
            await client.query("ROLLBACK");
            return c.json(
              {
                error: "escalate_to_role must be a higher ladder role",
                code: "invalid_escalate_role",
              },
              422,
            );
          }
        }
      }

      const nextMeta = applyEscalateToRoleMetadata(rich.metadata, target, {
        membership_id: session.userId,
        email: session.email,
      });
      await client.query(
        `UPDATE approval
         SET metadata = $3::jsonb
         WHERE organization_id = $1 AND approval_id = $2
           AND status IN ('pending', 'needs_info')`,
        [session.organizationId, approvalId, JSON.stringify(nextMeta)],
      );
      await auditFromConsoleSession(client, session, {
        action: "approval.escalated_to_role",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: { escalate_to_role: target },
      });
      const updated = await getApprovalRich(
        client,
        session.organizationId,
        approvalId,
      );
      await client.query("COMMIT");
      return c.json({
        approval: updated ? serializeApproval(updated) : null,
        escalate_to_role: target,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

approvalRoutes.post(
  "/approvals/:approvalId/reassign",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canDecideApprovals(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }
    let body: { assignee_email?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (!body.assignee_email?.trim()) {
      return c.json({ error: "assignee_email required" }, 422);
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const detail = await reassignApproval(
        client,
        session.organizationId,
        approvalId,
        session.userId,
        body.assignee_email,
      );
      if (!detail) {
        await client.query("ROLLBACK");
        return c.json({ error: "Not found or not pending" }, 404);
      }
      await auditFromConsoleSession(client, session, {
        action: "approval.reassigned",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: { assignee_email: body.assignee_email.trim().toLowerCase() },
      });
      const rich = await getApprovalRich(client, session.organizationId, approvalId);
      await client.query("COMMIT");
      return c.json({ approval: rich ? serializeApproval(rich) : null });
    } catch (error) {
      await client.query("ROLLBACK");
      const message = error instanceof Error ? error.message : "Reassign failed";
      if (
        message.includes("email") ||
        message.includes("Assignee") ||
        message.includes("member")
      ) {
        return c.json({ error: message }, 422);
      }
      throw error;
    } finally {
      client.release();
    }
  },
);
