import type { Context } from "hono";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { evaluateExecutionPermit } from "../execution/permit.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * POST /v1/aegis/execution/permit
 *
 * Core ledger asks: may this action execute? Answered from sealed receipts.
 * Auth: ingest API key (same as governed intake).
 */
export async function postExecutionPermit(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let body: {
    case_id?: string;
    trace_id?: string;
    action?: Record<string, unknown>;
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

    const result = await evaluateExecutionPermit(client, auth.organizationId, {
      case_id: body.case_id,
      trace_id: body.trace_id,
      action: body.action ?? {},
    });

    return c.json(result, result.permitted ? 200 : 403);
  } finally {
    client.release();
  }
}
