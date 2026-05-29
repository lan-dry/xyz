import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import {
  activatePolicy,
  createPolicy,
  getPolicyWithRules,
  listPoliciesByOrganization,
} from "../../repo/policies.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function serializePolicy(row: {
  policy_id: string;
  name: string;
  version: number;
  status: string;
  rego_source: string | null;
  activated_at: Date | null;
  created_at: Date;
}) {
  return {
    policy_id: row.policy_id,
    name: row.name,
    version: row.version,
    status: row.status,
    rego_source: row.rego_source,
    activated_at: row.activated_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

export const policyRoutes = new Hono<{ Variables: ConsoleVariables }>();

policyRoutes.get("/policies", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const policies = await listPoliciesByOrganization(getPool(), orgId);
  return c.json({ policies: policies.map(serializePolicy) });
});

policyRoutes.get("/policies/:policyId", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const policyId = c.req.param("policyId");
  if (!policyId) {
    return c.json({ error: "policyId required" }, 422);
  }
  const row = await getPolicyWithRules(getPool(), orgId, policyId);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    policy: serializePolicy(row.policy),
    rules: row.rules.map((r) => ({
      rule_id: r.rule_id,
      tool_pattern: r.tool_pattern,
      decision: r.decision,
      priority: r.priority,
      conditions: r.conditions,
    })),
  });
});

policyRoutes.post("/policies", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: {
    name?: string;
    rego_source?: string | null;
    rules?: Array<{
      tool_pattern: string;
      decision: string;
      priority?: number;
      conditions?: Record<string, unknown> | null;
    }>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  if (!body.name?.trim() || !body.rules?.length) {
    return c.json({ error: "name and rules required" }, 422);
  }

  const pool = getPool();
  const created = await createPolicy(pool, session.organizationId, session.userId, {
    name: body.name.trim(),
    rego_source: body.rego_source ?? null,
    rules: body.rules,
  });

  await auditFromConsoleSession(pool, session, {
    action: "policy.created",
    resourceType: "policy",
    resourceId: created.policy.policy_id,
    metadata: { name: created.policy.name, version: created.policy.version },
  });

  return c.json(
    {
      policy: serializePolicy(created.policy),
      rules: created.rules,
    },
    201,
  );
});

policyRoutes.post(
  "/policies/:policyId/activate",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (session.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const policyId = c.req.param("policyId");
    if (!policyId) {
      return c.json({ error: "policyId required" }, 422);
    }

    const pool = getPool();
    const activated = await activatePolicy(pool, session.organizationId, policyId);
    if (!activated) {
      return c.json({ error: "Not found" }, 404);
    }
    await auditFromConsoleSession(pool, session, {
      action: "policy.activated",
      resourceType: "policy",
      resourceId: activated.policy_id,
      metadata: { name: activated.name, version: activated.version },
    });
    return c.json({ policy: serializePolicy(activated) });
  },
);
