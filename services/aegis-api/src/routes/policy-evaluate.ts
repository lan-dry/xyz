import type { Context } from "hono";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { evaluateToolPolicy } from "../policy/evaluate.js";
import {
  recordPolicyGateAsTrace,
  recordPolicyObligationGate,
} from "../workflows/bridge.js";
import { notifyApprovalPending } from "../approvals/notify.js";

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

function approvalUrl(approvalId: string): string | undefined {
  const base = consoleBaseUrl()?.replace(/\/$/, "");
  if (!base) return undefined;
  return `${base}/aegis/approvals?focus=${encodeURIComponent(approvalId)}`;
}

/** Gate traces only for deny / human approval. Allow folds into Record Run. */
function shouldRecordGate(
  decision: string,
  record: boolean | undefined,
): boolean {
  if (record === false) return false;
  if (record === true) return decision === "deny" || decision === "allow_with_obligation";
  return decision === "deny" || decision === "allow_with_obligation";
}

/**
 * Evaluate tool policy. Records a signed gate trace only on deny or
 * allow_with_obligation. Plain allow is returned for Record Run (one trace).
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
    /** false = never record; true = record deny/obligation only; default = auto */
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

    if (!shouldRecordGate(result.decision, body.record)) {
      return c.json({ ...result, recorded: false });
    }

    try {
      await client.query("BEGIN");

      if (result.decision === "allow_with_obligation") {
        const recorded = await recordPolicyObligationGate(client, {
          organizationId: body.organization_id,
          agentId: body.agent_id,
          toolName: body.tool_name,
          policyId: result.policy_id,
          ruleId: result.rule_id,
          reason: result.reason,
          engine: result.engine,
          externalSystem: body.external_system ?? "n8n",
          externalWorkflowId: body.external_workflow_id,
          externalExecutionId: body.external_execution_id,
          requestPayload: body.payload,
        });
        await client.query("COMMIT");

        const payload = body.payload ?? {};
        const amountRaw = payload.amount_usd ?? payload.amount;
        const amountUsd =
          typeof amountRaw === "number"
            ? amountRaw
            : typeof amountRaw === "string"
              ? Number.parseFloat(amountRaw)
              : undefined;

        const recipient =
          typeof payload.recipient === "string" ? payload.recipient : undefined;

        notifyApprovalPending(client, {
          organizationId: body.organization_id,
          approvalId: recorded.approval_id,
          toolName: body.tool_name,
          traceId: recorded.trace_id,
          eventId: recorded.events[0]?.event_id ?? "",
          requestSummary:
            typeof payload.summary === "string" ? payload.summary : undefined,
          amountUsd: Number.isFinite(amountUsd) ? amountUsd : undefined,
          recipient,
        });

        return c.json({
          ...result,
          recorded: true,
          trace_id: recorded.trace_id,
          trace_status: recorded.status,
          trace_url: traceUrl(recorded.trace_id),
          approval_id: recorded.approval_id,
          approval_url: approvalUrl(recorded.approval_id),
          events: recorded.events,
        });
      }

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
