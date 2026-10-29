import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { evaluateToolPolicy } from "../../policy/evaluate.js";
import {
  activatePolicy,
  archivePolicy,
  createPolicy,
  deleteDraftPolicy,
  getPolicyWithRules,
  listPoliciesByOrganization,
  updateDraftPolicy,
} from "../../repo/policies.js";
import { listDraftPolicyConflicts } from "../../repo/policy-conflicts.js";
import { getGovernanceSettings } from "../../repo/governance-settings.js";
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
  environment?: string;
  activated_at: Date | null;
  created_at: Date;
}) {
  return {
    policy_id: row.policy_id,
    name: row.name,
    version: row.version,
    status: row.status,
    environment: row.environment ?? "production",
    rego_source: row.rego_source,
    activated_at: row.activated_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

export const policyRoutes = new Hono<{ Variables: ConsoleVariables }>();

policyRoutes.get("/policies", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const envRaw = c.req.query("environment")?.trim();
  const environment =
    envRaw === "sandbox" || envRaw === "production" ? envRaw : undefined;
  const policies = await listPoliciesByOrganization(
    getPool(),
    orgId,
    environment,
  );
  const conflicts = await listDraftPolicyConflicts(getPool(), orgId);
  return c.json({
    policies: policies.map(serializePolicy),
    draft_conflicts: conflicts,
  });
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
    environment?: string;
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
    environment: body.environment === "sandbox" ? "sandbox" : "production",
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

policyRoutes.post("/policies/test", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  let body: {
    agent_id?: string;
    tool_name?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.tool_name?.trim()) {
    return c.json({ error: "tool_name required" }, 422);
  }

  const pool = getPool();
  const agentId =
    body.agent_id?.trim() ||
    (
      await pool.query<{ agent_id: string }>(
        `SELECT agent_id FROM agent
         WHERE organization_id = $1 AND active = true
         ORDER BY created_at ASC LIMIT 1`,
        [session.organizationId],
      )
    ).rows[0]?.agent_id;
  if (!agentId) {
    return c.json({ error: "No agent available to test against" }, 422);
  }

  const result = await evaluateToolPolicy(pool, {
    organizationId: session.organizationId,
    agentId,
    toolName: body.tool_name.trim(),
    payload: body.payload ?? {},
  });

  const layerLabel =
    result.decision_layer === "ceiling"
      ? "Hard ceiling"
      : result.decision_layer === "contextual"
        ? "Contextual rule"
        : result.decision_layer === "override"
          ? "Override"
          : result.decision_layer === "agent"
            ? "Agent kill switch"
            : "Default";

  const plain =
    result.decision === "allow"
      ? `Allow: ${result.reason} (${layerLabel})`
      : result.decision === "deny"
        ? `Stop: ${result.reason} (${layerLabel})`
        : `Ask a person: ${result.reason} (${layerLabel})`;

  return c.json({
    result: {
      ...result,
      plain_language: plain,
      agent_id: agentId,
    },
  });
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
    const governance = await getGovernanceSettings(pool, session.organizationId);

    if (governance.two_person_policy_activate) {
      const existing = await pool.query<{
        request_id: string;
        requested_by: string;
      }>(
        `SELECT request_id, requested_by FROM policy_activation_request
         WHERE organization_id = $1 AND policy_id = $2 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [session.organizationId, policyId],
      );
      const pending = existing.rows[0];
      if (!pending) {
        const requestId = `par_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        try {
          await pool.query(
            `INSERT INTO policy_activation_request (
               request_id, organization_id, policy_id, requested_by, status
             ) VALUES ($1, $2, $3, $4, 'pending')`,
            [requestId, session.organizationId, policyId, session.userId],
          );
        } catch {
          return c.json(
            {
              error:
                "Two-person activate requires migration 006. Run: pnpm db:migrate",
            },
            503,
          );
        }
        await auditFromConsoleSession(pool, session, {
          action: "policy.activation_requested",
          resourceType: "policy",
          resourceId: policyId,
          metadata: { request_id: requestId },
        });
        return c.json({
          pending_confirmation: true,
          request_id: requestId,
          message:
            "Activation requested. A second distinct admin must confirm Activate.",
        });
      }
      if (pending.requested_by === session.userId) {
        return c.json(
          {
            error:
              "Four-eyes: a different admin must confirm this policy activation.",
          },
          403,
        );
      }
      await pool.query(
        `UPDATE policy_activation_request
         SET status = 'activated', confirmed_by = $1, decided_at = now()
         WHERE request_id = $2`,
        [session.userId, pending.request_id],
      );
    }

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

policyRoutes.patch("/policies/:policyId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const policyId = c.req.param("policyId");
  if (!policyId) {
    return c.json({ error: "policyId required" }, 422);
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
  try {
    const updated = await updateDraftPolicy(pool, session.organizationId, policyId, {
      name: body.name.trim(),
      rego_source: body.rego_source ?? null,
      rules: body.rules,
    });
    if (!updated) {
      return c.json({ error: "Not found" }, 404);
    }
    await auditFromConsoleSession(pool, session, {
      action: "policy.updated",
      resourceType: "policy",
      resourceId: updated.policy.policy_id,
      metadata: { name: updated.policy.name, version: updated.policy.version },
    });
    return c.json({
      policy: serializePolicy(updated.policy),
      rules: updated.rules,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "POLICY_NOT_DRAFT") {
      return c.json({ error: "Only draft policies can be edited" }, 409);
    }
    throw err;
  }
});

policyRoutes.delete("/policies/:policyId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const policyId = c.req.param("policyId");
  if (!policyId) {
    return c.json({ error: "policyId required" }, 422);
  }

  const pool = getPool();
  const deleted = await deleteDraftPolicy(pool, session.organizationId, policyId);
  if (!deleted) {
    return c.json({ error: "Not found or not a draft" }, 404);
  }
  await auditFromConsoleSession(pool, session, {
    action: "policy.deleted",
    resourceType: "policy",
    resourceId: policyId,
  });
  return c.json({ ok: true });
});

policyRoutes.post(
  "/policies/:policyId/archive",
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
    const archived = await archivePolicy(pool, session.organizationId, policyId);
    if (!archived) {
      return c.json({ error: "Not found or not active" }, 404);
    }
    await auditFromConsoleSession(pool, session, {
      action: "policy.archived",
      resourceType: "policy",
      resourceId: archived.policy_id,
      metadata: { name: archived.name, version: archived.version },
    });
    return c.json({ policy: serializePolicy(archived) });
  },
);
