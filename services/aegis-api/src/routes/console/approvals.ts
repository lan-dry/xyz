import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { ingestHumanApprovalEvent } from "../../console/human-approval-event.js";
import {
  decideApproval,
  getApproval,
  listPendingApprovals,
} from "../../repo/approvals.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function serializeApproval(row: {
  approval_id: string;
  event_id: string;
  status: string;
  trace_id: string;
  tool_name: string | null;
  agent_id: string;
  created_at: Date;
  decided_at: Date | null;
}) {
  return {
    approval_id: row.approval_id,
    event_id: row.event_id,
    status: row.status,
    trace_id: row.trace_id,
    tool_name: row.tool_name,
    agent_id: row.agent_id,
    created_at: row.created_at.toISOString(),
    decided_at: row.decided_at?.toISOString() ?? null,
  };
}

export const approvalRoutes = new Hono<{ Variables: ConsoleVariables }>();

approvalRoutes.get("/approvals", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const status = c.req.query("status") ?? "pending";
  if (status !== "pending") {
    return c.json({ error: "Only status=pending supported in Stage 7" }, 422);
  }
  const rows = await listPendingApprovals(getPool(), orgId);
  return c.json({ approvals: rows.map(serializeApproval) });
});

approvalRoutes.get("/approvals/:approvalId", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const approvalId = c.req.param("approvalId");
  if (!approvalId) {
    return c.json({ error: "approvalId required" }, 422);
  }
  const row = await getApproval(getPool(), orgId, approvalId);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ approval: serializeApproval(row) });
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
      const decided = await decideApproval(
        client,
        session.organizationId,
        approvalId,
        session.userId,
        "approved",
      );
      if (!decided) {
        return c.json({ error: "Not found or not pending" }, 404);
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
      });

      await auditFromConsoleSession(client, session, {
        action: "approval.approved",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: { trace_id: decided.trace_id, event_id: decided.event_id },
      });

      return c.json({ approval: serializeApproval(decided) });
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
      const decided = await decideApproval(
        client,
        session.organizationId,
        approvalId,
        session.userId,
        "rejected",
      );
      if (!decided) {
        return c.json({ error: "Not found or not pending" }, 404);
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
      });

      await auditFromConsoleSession(client, session, {
        action: "approval.rejected",
        resourceType: "approval",
        resourceId: approvalId,
        metadata: { trace_id: decided.trace_id, event_id: decided.event_id },
      });

      return c.json({ approval: serializeApproval(decided) });
    } finally {
      client.release();
    }
  },
);
