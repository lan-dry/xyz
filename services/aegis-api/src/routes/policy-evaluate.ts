import type { Context } from "hono";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { evaluateToolPolicy } from "../policy/evaluate.js";
import { recordPolicyGateAsTrace } from "../workflows/bridge.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function consoleBaseUrl(): string | undefined {
  return process.env.CONSOLE_PUBLIC_URL?.trim() || process.env.CONSOLE_ORIGIN?.trim();
}

function traceUrl(traceId: string): string | undefined {
  const base = consoleBaseUrl()?.replace(/\/$/, "");
  if (!base) return undefined;
  return `${base}/aegis/traces/${encodeURIComponent(traceId)}`;
}

/**
 * Evaluate tool policy. By default also writes a signed trace so deny/allow
 * is auditable (who / tool / rule / reason) — not a silent JSON reply.
 */
export async function postPolicyEvaluate(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let body: {
    organization_id?: string;
    agent_id?: string;
    tool_name?: string;
    payload?: Record<string, unknown>;
    /** Default true: write a signed gate trace. Set false to evaluate only. */
    record?: boolean;
    external_system?: string;
    external_workflow_id?: string;
    external_execution_id?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 422);
  }

  if (!body.organization_id || !body.agent_id || !body.tool_name) {
    return c.json(
      { error: "organization_id, agent_id, and tool_name required" },
      422,
    );
  }

  const shouldRecord = body.record !== false;

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }
    if (auth.organizationId !== body.organization_id) {
      return c.json({ error: "Organization mismatch for API key" }, 403);
    }

    const result = await evaluateToolPolicy(client, {
      organizationId: body.organization_id,
      agentId: body.agent_id,
      toolName: body.tool_name,
      payload: body.payload,
    });

    if (!shouldRecord) {
      return c.json(result);
    }

    try {
      await client.query("BEGIN");
      const recorded = await recordPolicyGateAsTrace(client, {
        organizationId: body.organization_id,
        agentId: body.agent_id,
        toolName: body.tool_name,
        decision: result.decision,
        policyId: result.policy_id,
        ruleId: result.rule_id,
        reason: result.reason,
        engine: result.engine,
        externalSystem: body.external_system ?? "n8n",
        externalWorkflowId: body.external_workflow_id,
        externalExecutionId: body.external_execution_id,
      });
      await client.query("COMMIT");

      return c.json({
        ...result,
        recorded: true,
        trace_id: recorded.trace_id,
        trace_status: recorded.status,
        trace_url: traceUrl(recorded.trace_id),
        events: recorded.events,
      });
    } catch (recordErr) {
      await client.query("ROLLBACK");
      console.error("[aegis] policy evaluate record failed", recordErr);
      // Still return the live decision; recording failure must not unblock deny.
      return c.json({
        ...result,
        recorded: false,
        record_error:
          recordErr instanceof Error ? recordErr.message : "Failed to record gate",
      });
    }
  } finally {
    client.release();
  }
}
