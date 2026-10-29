import type { Context } from "hono";
import { Hono } from "hono";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { evaluateToolPolicy } from "../policy/evaluate.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Phase 4 tool gateway: discover tools + evaluate before upstream calls.
 * Same policy engine as wrapFetch / n8n — no app rewrite required for HTTP agents.
 */
export const gatewayRoutes = new Hono();

gatewayRoutes.get("/gateway/tools", async (c) => {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) return c.json({ error: "Missing or invalid Authorization" }, 401);

  const agentId = c.req.query("agent_id")?.trim();
  if (!agentId) return c.json({ error: "agent_id required" }, 422);

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) return c.json({ error: "Invalid ingest API key" }, 401);

    const declared = await client.query<{ declared_tools: unknown }>(
      `SELECT declared_tools FROM agent
       WHERE organization_id = $1 AND agent_id = $2`,
      [auth.organizationId, agentId],
    );
    if (!declared.rows[0]) return c.json({ error: "Agent not found" }, 404);

    const recent = await client.query<{ tool_name: string }>(
      `SELECT DISTINCT tool_name FROM event
       WHERE organization_id = $1 AND agent_id = $2
         AND tool_name IS NOT NULL AND emitted_at >= now() - interval '30 days'
       ORDER BY tool_name ASC
       LIMIT 100`,
      [auth.organizationId, agentId],
    );
    const declaredTools = Array.isArray(declared.rows[0].declared_tools)
      ? (declared.rows[0].declared_tools as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    const tools = [
      ...new Set([...declaredTools, ...recent.rows.map((r) => r.tool_name)]),
    ].sort();
    return c.json({
      agent_id: agentId,
      tools,
      note: "POST /v1/aegis/gateway/evaluate before invoking a tool; wrapFetch and n8n use the same engine.",
    });
  } finally {
    client.release();
  }
});

export async function postGatewayEvaluate(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) return c.json({ error: "Missing or invalid Authorization" }, 401);

  let body: {
    organization_id?: string;
    agent_id?: string;
    tool_name?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
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
    if (!auth) return c.json({ error: "Invalid ingest API key" }, 401);
    if (auth.organizationId !== body.organization_id) {
      return c.json({ error: "Organization mismatch for API key" }, 403);
    }

    const result = await evaluateToolPolicy(client, {
      organizationId: body.organization_id,
      agentId: body.agent_id,
      toolName: body.tool_name,
      payload: body.payload,
    });

    return c.json({
      ...result,
      gateway: true,
      tool_name: body.tool_name,
    });
  } finally {
    client.release();
  }
}

gatewayRoutes.post("/gateway/evaluate", postGatewayEvaluate);
