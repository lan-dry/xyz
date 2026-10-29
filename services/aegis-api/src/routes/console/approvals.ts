import { Hono } from "hono";
import { canDecideApprovals } from "@salanor/platform-auth";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { ingestHumanApprovalEvent } from "../../console/human-approval-event.js";
import { buildRequestPreview } from "../../approvals/request-preview.js";
import {
  askMoreOnApproval,
  assertApproverAllowed,
  decideApproval,
  expireStaleApprovals,
  getApprovalRich,
  listPendingApprovals,
  listRecentApprovalsPaginated,
  reassignApproval,
  type ApprovalRichDetail,
} from "../../repo/approvals.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { isBridgeMasterKeyConfigured } from "../../crypto/bridge-key-vault.js";
import { getOrCreateApprovalSigningKeyId } from "../../repo/signing-keys.js";
import { verifyApprovalActionToken } from "../../approvals/action-token.js";
import { getGovernanceSettings } from "../../repo/governance-settings.js";
import { dispatchOrgWebhookEvent } from "../../webhooks/dispatch.js";

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
    decision: "approved" | "rejected";
    reason?: string;
  },
) {
  const decided = await decideApproval(
    client,
    params.organizationId,
    params.approvalId,
    params.userId,
    params.decision,
    { reason: params.reason, voterEmail: params.email },
  );
  if (!decided) return null;

  if (decided.finalized) {
    const approvalKeyId = await getOrCreateApprovalSigningKeyId(
      client,
      params.organizationId,
      decided.detail.agent_id,
      decided.detail.key_id,
    );
    await ingestHumanApprovalEvent(client, {
      organizationId: params.organizationId,
      traceId: decided.detail.trace_id,
      agentId: decided.detail.agent_id,
      keyId: approvalKeyId,
      parentEventId: decided.detail.event_id,
      approverEmail: params.email,
      approvalId: params.approvalId,
      decision: params.decision,
      toolName: decided.detail.tool_name ?? undefined,
      reason: params.reason,
    });
  }

  return decided;
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

export const approvalRoutes = new Hono<{ Variables: ConsoleVariables }>();

approvalRoutes.get("/approvals", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const status = c.req.query("status") ?? "pending";

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
    });
    return c.json({
      approvals: result.rows.map(serializeApproval),
      total: result.total,
      limit,
      offset,
    });
  }

  if (status !== "pending") {
    return c.json({ error: "Use status=pending or status=history" }, 422);
  }

  await expireStaleApprovals(getPool(), orgId);
  const rows = await listPendingApprovals(getPool(), orgId);
  const governance = await getGovernanceSettings(getPool(), orgId);
  const blocked = rows.length;
  return c.json({
    approvals: rows.map(serializeApproval),
    blocked_traces: blocked,
    required_approvers: governance.required_approvers,
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
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await expireStaleApprovals(client, session.organizationId);
    const selfCheck = await assertApproverAllowed(
      client,
      session.organizationId,
      approvalId,
      session.email,
    );
    if (!selfCheck.ok) {
      await client.query("ROLLBACK");
      return c.json({ error: selfCheck.error }, 403);
    }
    const decided = await finalizeHumanApproval(client, {
      organizationId: session.organizationId,
      approvalId,
      userId: session.userId,
      email: session.email,
      decision: claims.decision,
      reason: body.reason?.trim(),
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
    let body: { reason?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await expireStaleApprovals(client, session.organizationId);
      const selfCheck = await assertApproverAllowed(
        client,
        session.organizationId,
        approvalId,
        session.email,
      );
      if (!selfCheck.ok) {
        await client.query("ROLLBACK");
        return c.json({ error: selfCheck.error }, 403);
      }
      const decided = await finalizeHumanApproval(client, {
        organizationId: session.organizationId,
        approvalId,
        userId: session.userId,
        email: session.email,
        decision: "approved",
        reason: body.reason?.trim(),
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
        "approved",
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
    let body: { reason?: string } = {};
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
      await expireStaleApprovals(client, session.organizationId);
      const selfCheck = await assertApproverAllowed(
        client,
        session.organizationId,
        approvalId,
        session.email,
      );
      if (!selfCheck.ok) {
        await client.query("ROLLBACK");
        return c.json({ error: selfCheck.error }, 403);
      }
      const decided = await finalizeHumanApproval(client, {
        organizationId: session.organizationId,
        approvalId,
        userId: session.userId,
        email: session.email,
        decision: "rejected",
        reason: body.reason.trim(),
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
