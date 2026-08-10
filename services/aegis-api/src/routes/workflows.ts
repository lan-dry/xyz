import type { Context } from "hono";

import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import {
  appendWorkflowSteps,
  completeWorkflowRun,
  getWorkflowRun,
  startWorkflowRun,
  type ExecutionNodeCapture,
  type PolicyGateCapture,
  type WorkflowStepInput,
} from "../workflows/bridge.js";

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

export async function postWorkflowRunStart(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let body: {
    organization_id?: string;
    agent_id?: string;
    key_id?: string;
    business_context?: string;
    external_system?: string;
    external_workflow_id?: string;
    external_execution_id?: string;
    trigger_detail?: string;
    actor_principal?: string;
    /** One-shot: start + pack + complete in this same request (preferred for n8n). */
    one_shot?: boolean;
    status?: "completed" | "failed";
    summary?: string;
    steps?: WorkflowStepInput[];
    execution?: {
      workflow_name?: string;
      execution_id?: string;
      nodes?: ExecutionNodeCapture[];
    };
    policy_gate?: PolicyGateCapture;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const oneShot =
    body.one_shot === true ||
    body.execution != null ||
    body.policy_gate != null ||
    body.status === "completed" ||
    body.status === "failed" ||
    (Array.isArray(body.steps) && body.steps.length > 0);

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }

    const organizationId = body.organization_id ?? auth.organizationId;
    if (organizationId !== auth.organizationId) {
      return c.json({ error: "Organization mismatch" }, 403);
    }

    const started = await startWorkflowRun(client, {
      organizationId,
      agentId: body.agent_id,
      keyId: body.key_id,
      businessContext: body.business_context,
      externalSystem: body.external_system ?? "n8n",
      externalWorkflowId: body.external_workflow_id,
      externalExecutionId: body.external_execution_id,
      triggerDetail: body.trigger_detail,
      actorPrincipal: body.actor_principal,
    });

    if (!oneShot) {
      return c.json(
        {
          ...started,
          trace_url: traceUrl(started.trace_id),
        },
        201,
      );
    }

    const result = await completeWorkflowRun(client, {
      organizationId,
      traceId: started.trace_id,
      status: body.status ?? "completed",
      summary: body.summary ?? body.business_context,
      steps: body.steps,
      execution: body.execution,
      policy_gate: body.policy_gate,
      actorPrincipal: body.actor_principal,
    });

    return c.json(
      {
        ...result,
        agent_id: started.agent_id,
        key_id: started.key_id,
        root_event_id: started.root_event_id,
        trace_url: traceUrl(result.trace_id),
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start workflow run";
    const status = message.includes("No Workflow Bridge") ? 409 : 500;
    return c.json({ error: message }, status);
  } finally {
    client.release();
  }
}

export async function postWorkflowRunSteps(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const traceId = c.req.param("traceId");
  if (!traceId) {
    return c.json({ error: "traceId required" }, 422);
  }

  let body: {
    organization_id?: string;
    steps?: WorkflowStepInput[];
    actor_principal?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return c.json({ error: "steps array required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }
    const organizationId = body.organization_id ?? auth.organizationId;
    if (organizationId !== auth.organizationId) {
      return c.json({ error: "Organization mismatch" }, 403);
    }

    const result = await appendWorkflowSteps(client, {
      organizationId,
      traceId,
      steps: body.steps,
      actorPrincipal: body.actor_principal,
    });

    return c.json({ trace_id: traceId, ...result }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to append steps";
    const status =
      message.includes("not found") ? 404 : message.includes("Maximum") ? 422 : 409;
    return c.json({ error: message }, status);
  } finally {
    client.release();
  }
}

export async function postWorkflowRunComplete(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const traceId = c.req.param("traceId");
  if (!traceId) {
    return c.json({ error: "traceId required" }, 422);
  }

  let body: {
    organization_id?: string;
    status?: "completed" | "failed";
    summary?: string;
    steps?: WorkflowStepInput[];
    execution?: {
      workflow_name?: string;
      execution_id?: string;
      nodes?: ExecutionNodeCapture[];
    };
    policy_gate?: PolicyGateCapture;
    actor_principal?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }
    const organizationId = body.organization_id ?? auth.organizationId;
    if (organizationId !== auth.organizationId) {
      return c.json({ error: "Organization mismatch" }, 403);
    }

    const result = await completeWorkflowRun(client, {
      organizationId,
      traceId,
      status: body.status,
      summary: body.summary,
      steps: body.steps,
      execution: body.execution,
      policy_gate: body.policy_gate,
      actorPrincipal: body.actor_principal,
    });

    return c.json({
      ...result,
      trace_url: traceUrl(result.trace_id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete workflow run";
    const status = message.includes("not found") ? 404 : 409;
    return c.json({ error: message }, status);
  } finally {
    client.release();
  }
}

/**
 * One-shot capture: start + pack steps + complete in a single HTTP call.
 * Prefer this from n8n (one node at the end of the workflow).
 */
export async function postWorkflowRunCapture(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let body: {
    organization_id?: string;
    agent_id?: string;
    key_id?: string;
    business_context?: string;
    external_system?: string;
    external_workflow_id?: string;
    external_execution_id?: string;
    trigger_detail?: string;
    actor_principal?: string;
    status?: "completed" | "failed";
    summary?: string;
    steps?: WorkflowStepInput[];
    execution?: {
      workflow_name?: string;
      execution_id?: string;
      nodes?: ExecutionNodeCapture[];
    };
    policy_gate?: PolicyGateCapture;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }

    const organizationId = body.organization_id ?? auth.organizationId;
    if (organizationId !== auth.organizationId) {
      return c.json({ error: "Organization mismatch" }, 403);
    }

    const started = await startWorkflowRun(client, {
      organizationId,
      agentId: body.agent_id,
      keyId: body.key_id,
      businessContext: body.business_context,
      externalSystem: body.external_system ?? "n8n",
      externalWorkflowId: body.external_workflow_id,
      externalExecutionId: body.external_execution_id,
      triggerDetail: body.trigger_detail,
      actorPrincipal: body.actor_principal,
    });

    const result = await completeWorkflowRun(client, {
      organizationId,
      traceId: started.trace_id,
      status: body.status,
      summary: body.summary ?? body.business_context,
      steps: body.steps,
      execution: body.execution,
      policy_gate: body.policy_gate,
      actorPrincipal: body.actor_principal,
    });

    return c.json(
      {
        ...result,
        agent_id: started.agent_id,
        key_id: started.key_id,
        root_event_id: started.root_event_id,
        trace_url: traceUrl(result.trace_id),
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to capture workflow run";
    const status = message.includes("No Workflow Bridge") ? 409 : 500;
    return c.json({ error: message }, status);
  } finally {
    client.release();
  }
}

export async function getWorkflowRunStatus(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const traceId = c.req.param("traceId");
  if (!traceId) {
    return c.json({ error: "traceId required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }

    const run = await getWorkflowRun(client, auth.organizationId, traceId);
    if (!run) {
      return c.json({ error: "Workflow run not found" }, 404);
    }

    return c.json({
      ...run,
      trace_url: traceUrl(run.trace_id),
    });
  } finally {
    client.release();
  }
}
