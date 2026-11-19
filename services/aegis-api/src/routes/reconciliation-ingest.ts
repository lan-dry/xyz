/**
 * Machine feed ingest (ingest API key): POST /v1/aegis/reconciliation/feeds/:feedId/ingest
 */
import type { Context } from "hono";
import { getPool } from "../db/pool.js";
import { resolveIngestKey } from "../auth/ingest-key.js";
import {
  FeedIngestError,
  ingestFeedBody,
} from "../reconciliation/ingest.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function postReconciliationFeedIngest(c: Context) {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }
  const auth = await resolveIngestKey(getPool(), token);
  if (!auth) {
    return c.json({ error: "Invalid ingest key" }, 401);
  }

  const feedId = c.req.param("feedId");
  if (!feedId) return c.json({ error: "feedId required" }, 422);

  const contentType = c.req.header("content-type") ?? "";
  let bodyText: string;
  let formatHint: string | null = null;
  if (contentType.includes("application/json")) {
    const json = await c.req.json().catch(() => null);
    if (json && typeof json === "object" && !Array.isArray(json)) {
      const obj = json as { body?: unknown; format?: unknown; rows?: unknown };
      if (typeof obj.body === "string") {
        bodyText = obj.body;
        formatHint = typeof obj.format === "string" ? obj.format : null;
      } else if (Array.isArray(obj.rows)) {
        bodyText = JSON.stringify(obj.rows);
        formatHint = "json";
      } else {
        bodyText = JSON.stringify(json);
        formatHint = "json";
      }
    } else if (Array.isArray(json)) {
      bodyText = JSON.stringify(json);
      formatHint = "json";
    } else {
      return c.json({ error: "JSON body required" }, 422);
    }
  } else {
    bodyText = await c.req.text();
    if (contentType.includes("csv")) formatHint = "csv";
    else if (contentType.includes("ndjson")) formatHint = "jsonl";
  }

  try {
    const result = await ingestFeedBody(
      getPool(),
      auth.organizationId,
      feedId,
      bodyText,
      formatHint,
    );
    return c.json({
      feed_id: result.feed_id,
      inserted: result.inserted,
      unchanged: result.unchanged,
      edited: result.edited,
      row_count: result.rows.length,
    });
  } catch (err) {
    if (err instanceof FeedIngestError) {
      const status =
        err.code === "not_found" ? 404 : err.code === "parse" ? 422 : 409;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
}
