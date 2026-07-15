import type { Context } from "hono";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import {
  createApprovalRequest,
  getApproval,
  type DeferredRequest,
} from "../repo/approvals.js";
import { notifyApprovalPending } from "../approvals/notify.js";
import { completeTrace } from "../repo/trace-status.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function postApprovalRequest(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let body: {
    organization_id?: string;
    event_id?: string;
    trace_id?: string;
    tool_name?: string;
    deferred?: DeferredRequest;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  if (
    !body.organization_id ||
    !body.event_id ||
    !body.trace_id ||
    !body.tool_name ||
    !body.deferred?.url
  ) {
    return c.json(
      { error: "organization_id, event_id, trace_id, tool_name, deferred required" },
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
      return c.json({ error: "Organization mismatch" }, 403);
    }

    const created = await createApprovalRequest(client, {
      organizationId: body.organization_id,
      eventId: body.event_id,
      traceId: body.trace_id,
      toolName: body.tool_name,
      deferred: {
        url: body.deferred.url,
        method: body.deferred.method ?? "GET",
      },
    });

    notifyApprovalPending(client, {
      organizationId: body.organization_id,
      approvalId: created.approval_id,
      toolName: body.tool_name,
      traceId: body.trace_id,
      eventId: body.event_id,
    });

    return c.json(created, 201);
  } finally {
    client.release();
  }
}

export async function getApprovalStatus(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const approvalId = c.req.param("approvalId");
  if (!approvalId) {
    return c.json({ error: "approvalId required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }

    const approval = await getApproval(client, auth.organizationId, approvalId);
    if (!approval) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({
      approval_id: approval.approval_id,
      status: approval.status,
      trace_id: approval.trace_id,
      tool_name: approval.tool_name,
      event_id: approval.event_id,
    });
  } finally {
    client.release();
  }
}

export async function postApprovalComplete(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const approvalId = c.req.param("approvalId");
  if (!approvalId) {
    return c.json({ error: "approvalId required" }, 422);
  }
  let body: { trace_id?: string; organization_id?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid ingest API key" }, 401);
    }

    const approval = await getApproval(client, auth.organizationId, approvalId);
    if (!approval) {
      return c.json({ error: "Not found" }, 404);
    }
    if (approval.status !== "approved") {
      return c.json({ error: "Approval not approved" }, 409);
    }

    const traceId = body.trace_id ?? approval.trace_id;
    await completeTrace(client, auth.organizationId, traceId);
    return c.json({ ok: true, trace_id: traceId, status: "completed" });
  } finally {
    client.release();
  }
}
