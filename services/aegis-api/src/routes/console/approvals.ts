import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { ingestHumanApprovalEvent } from "../../console/human-approval-event.js";
import {
  decideApproval,
  expireStaleApprovals,
  getApprovalRich,
  listPendingApprovals,
  listRecentApprovals,
  type ApprovalRichDetail,
} from "../../repo/approvals.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function requestPreview(payload: Record<string, unknown> | null): {
  amount_usd?: number;
  summary?: string;
  fields: Array<{ key: string; value: string }>;
} {
  if (!payload) {
    return { fields: [] };
  }
  const nested =
    payload.request_payload && typeof payload.request_payload === "object"
      ? (payload.request_payload as Record<string, unknown>)
      : payload;
  const amountRaw = nested.amount_usd ?? nested.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number.parseFloat(amountRaw)
        : undefined;
  const fields: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(nested)) {
    if (key === "amount_usd" || key === "amount") continue;
    if (value == null || typeof value === "object") continue;
    fields.push({ key, value: String(value) });
    if (fields.length >= 6) break;
  }
  const summary =
    typeof payload.investor_summary === "string"
      ? payload.investor_summary
      : typeof payload.rationale === "string"
        ? payload.rationale
        : undefined;
  return {
    amount_usd: Number.isFinite(amount) ? amount : undefined,
    summary,
    fields,
  };
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
    const rows = await listRecentApprovals(getPool(), orgId);
    return c.json({ approvals: rows.map(serializeApproval) });
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
