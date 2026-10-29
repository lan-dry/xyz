import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import {
  createWorkflow,
  ensureMerchantPayoutsWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  workflowScores,
} from "../../repo/workflows.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function serializeWorkflow(
  row: Awaited<ReturnType<typeof getWorkflow>>,
  scores?: { coverage_pct: number; evidence_readiness_pct: number },
) {
  if (!row) return null;
  return {
    workflow_id: row.workflow_id,
    name: row.name,
    description: row.description,
    environment: row.environment,
    agent_id: row.agent_id,
    policy_ids: row.policy_ids,
    external_ref: row.external_ref,
    fail_mode: row.fail_mode,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    coverage_pct: scores?.coverage_pct ?? null,
    evidence_readiness_pct: scores?.evidence_readiness_pct ?? null,
  };
}

export const workflowRoutes = new Hono<{ Variables: ConsoleVariables }>();

workflowRoutes.get("/workflows", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const envRaw = c.req.query("environment")?.trim();
  const environment =
    envRaw === "sandbox" || envRaw === "production" ? envRaw : undefined;
  const pool = getPool();
  try {
    if (c.req.query("ensure") === "merchant-payouts") {
      await ensureMerchantPayoutsWorkflow(
        pool,
        orgId,
        environment ?? "production",
      );
    }
    const rows = await listWorkflows(pool, orgId, environment);
    const withScores = await Promise.all(
      rows.map(async (row) => {
        const scores = await workflowScores(pool, orgId, row);
        return serializeWorkflow(row, scores);
      }),
    );
    return c.json({ workflows: withScores });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("governed_workflow") || message.includes("does not exist")) {
      return c.json(
        {
          error: "Workflows require migration 007. Run: pnpm db:migrate",
          workflows: [],
        },
        503,
      );
    }
    throw error;
  }
});

workflowRoutes.get("/workflows/:workflowId", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const workflowId = c.req.param("workflowId");
  if (!workflowId) return c.json({ error: "workflowId required" }, 422);
  const pool = getPool();
  const row = await getWorkflow(pool, orgId, workflowId);
  if (!row) return c.json({ error: "Not found" }, 404);
  const scores = await workflowScores(pool, orgId, row);
  return c.json({ workflow: serializeWorkflow(row, scores) });
});

workflowRoutes.post("/workflows", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin" && session.role !== "owner") {
    return c.json({ error: "Forbidden" }, 403);
  }
  let body: {
    name?: string;
    description?: string;
    agent_id?: string;
    policy_ids?: string[];
    environment?: string;
    external_ref?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.name?.trim()) {
    return c.json({ error: "name required" }, 422);
  }
  const environment =
    body.environment === "sandbox" ? "sandbox" : "production";
  const pool = getPool();
  const existing = await listWorkflows(pool, session.organizationId, environment);
  const nameNorm = body.name.trim().toLowerCase();
  if (existing.some((w) => w.name.trim().toLowerCase() === nameNorm)) {
    return c.json(
      { error: `A workflow named "${body.name.trim()}" already exists in ${environment}` },
      409,
    );
  }
  const created = await createWorkflow(pool, {
    organizationId: session.organizationId,
    environment,
    name: body.name,
    description: body.description,
    agentId: body.agent_id,
    policyIds: body.policy_ids,
    externalRef: body.external_ref,
  });
  await auditFromConsoleSession(pool, session, {
    action: "workflow.created",
    resourceType: "workflow",
    resourceId: created.workflow_id,
    metadata: { name: created.name, environment },
  });
  const scores = await workflowScores(pool, session.organizationId, created);
  return c.json({ workflow: serializeWorkflow(created, scores) }, 201);
});

workflowRoutes.patch("/workflows/:workflowId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin" && session.role !== "owner") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const workflowId = c.req.param("workflowId");
  if (!workflowId) return c.json({ error: "workflowId required" }, 422);
  let body: {
    name?: string;
    description?: string | null;
    agent_id?: string | null;
    policy_ids?: string[];
    external_ref?: string | null;
    fail_mode?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const pool = getPool();
  const updated = await updateWorkflow(pool, session.organizationId, workflowId, {
    name: body.name,
    description: body.description,
    agentId: body.agent_id,
    policyIds: body.policy_ids,
    externalRef: body.external_ref,
    failMode:
      body.fail_mode === "fail_open_buffer"
        ? "fail_open_buffer"
        : body.fail_mode === "fail_closed"
          ? "fail_closed"
          : undefined,
  });
  if (!updated) return c.json({ error: "Not found" }, 404);
  await auditFromConsoleSession(pool, session, {
    action: "workflow.updated",
    resourceType: "workflow",
    resourceId: workflowId,
  });
  const scores = await workflowScores(pool, session.organizationId, updated);
  return c.json({ workflow: serializeWorkflow(updated, scores) });
});
