import type { Context } from "hono";
import type { DecisionToken, ExecutableParams, SignedEnvelope } from "@salanor/aegis-sdk";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { confirmExecution } from "../execution/confirm.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * POST /v1/aegis/executions/confirm
 *
 * Executor presents a decision token + the actual parameters it is about to run.
 * Prefer wrapping params in an AEGIS-SRC1 source_envelope so the claim is attributable.
 */
export async function postExecutionsConfirm(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let body: {
    token?: DecisionToken;
    params?: ExecutableParams;
    source_envelope?: SignedEnvelope;
    break_glass?: boolean;
    reason?: string;
    case_id?: string;
    action_type?: string;
    flagged_unavailable?: boolean;
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

    await client.query("BEGIN");
    try {
      const result = await confirmExecution(client, {
        organizationId: auth.organizationId,
        token: body.token ?? null,
        params: body.params ?? null,
        source_envelope: body.source_envelope ?? null,
        break_glass: Boolean(body.break_glass),
        reason: body.reason ?? null,
        case_id: body.case_id ?? null,
        action_type: body.action_type ?? null,
        flagged_unavailable: Boolean(body.flagged_unavailable),
      });
      await client.query("COMMIT");
      if (!result.ok) {
        const status =
          result.code === "missing_reason" ||
          result.code === "missing_token" ||
          result.code === "missing_params"
            ? 422
            : result.code === "wrong_tenant"
              ? 403
              : 409;
        return c.json(result, status);
      }
      return c.json(result, 200);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}
