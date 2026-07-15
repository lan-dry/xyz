import type { Context } from "hono";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { evaluateToolPolicy } from "../policy/evaluate.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

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

    return c.json(result);
  } finally {
    client.release();
  }
}
