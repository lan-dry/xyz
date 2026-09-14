import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { ingestHumanApprovalEvent } from "../../console/human-approval-event.js";
import { buildRequestPreview } from "../../approvals/request-preview.js";
import {
  decideApproval,
  expireStaleApprovals,
  getApprovalRich,
  listPendingApprovals,
  listRecentApprovals,
  listRecentApprovalsPaginated,
  type ApprovalRichDetail,
} from "../../repo/approvals.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function requestPreview(payload: Record<string, unknown> | null) {
  return buildRequestPreview(payload);
}

function serializeApproval(row: ApprovalRichDetail) {
  const preview = requestPreview(row.event_payload);
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
  };
}

function serializeApprovalDetail(row: ApprovalRichDetail) {
  return {
    ...serializeApproval(row),
    event_payload: row.event_payload,
  };
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
  const blocked = rows.length;
  return c.json({ approvals: rows.map(serializeApproval), blocked_traces: blocked });
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
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }

    const client = await getPool().connect();
    try {
      await expireStaleApprovals(client, session.organizationId);
      const decided = await decideApproval(
        client,
        session.organizationId,
        approvalId,
        session.userId,
        "approved",
      );
      if (!decided) {
        return c.json({ error: "Not found, expired, or not pending" }, 404);
      }

      await ingestHumanApprovalEvent(client, {
        organizationId: session.organizationId,
        traceId: decided.trace_id,
        agentId: decided.agent_id,
        keyId: "key-dev-01",
        parentEventId: decided.event_id,
        approverEmail: session.email,
        approvalId,
        decision: "approved",
        toolName: decided.tool_name ?? undefined,
      });

      await auditFromConsoleSession(client, session, {
        action: "approval.approved",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: { trace_id: decided.trace_id, event_id: decided.event_id },
      });

      const rich = await getApprovalRich(client, session.organizationId, approvalId);
      return c.json({ approval: rich ? serializeApproval(rich) : null });
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
    const approvalId = c.req.param("approvalId");
    if (!approvalId) {
      return c.json({ error: "approvalId required" }, 422);
    }

    const client = await getPool().connect();
    try {
      await expireStaleApprovals(client, session.organizationId);
      const decided = await decideApproval(
        client,
        session.organizationId,
        approvalId,
        session.userId,
        "rejected",
      );
      if (!decided) {
        return c.json({ error: "Not found, expired, or not pending" }, 404);
      }

      await ingestHumanApprovalEvent(client, {
        organizationId: session.organizationId,
        traceId: decided.trace_id,
        agentId: decided.agent_id,
        keyId: "key-dev-01",
        parentEventId: decided.event_id,
        approverEmail: session.email,
        approvalId,
        decision: "rejected",
        toolName: decided.tool_name ?? undefined,
      });

      await auditFromConsoleSession(client, session, {
        action: "approval.rejected",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: { trace_id: decided.trace_id, event_id: decided.event_id },
      });

      const rich = await getApprovalRich(client, session.organizationId, approvalId);
      return c.json({ approval: rich ? serializeApproval(rich) : null });
    } finally {
      client.release();
    }
  },
);
