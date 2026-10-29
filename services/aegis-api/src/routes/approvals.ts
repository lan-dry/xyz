import type { Context } from "hono";
import {
  approvedActionMatches,
  digestActionPayload,
} from "../approvals/action-digest.js";
import { notifyApprovalPending } from "../approvals/notify.js";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import {
  createApprovalRequest,
  expireStaleApprovals,
  getApproval,
  type DeferredRequest,
} from "../repo/approvals.js";
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

    await expireStaleApprovals(client, auth.organizationId);
    const approval = await getApproval(client, auth.organizationId, approvalId);
    if (!approval) {
      return c.json({ error: "Not found" }, 404);
    }

    const meta =
      approval.metadata &&
      typeof approval.metadata === "object" &&
      !Array.isArray(approval.metadata)
        ? (approval.metadata as Record<string, unknown>)
        : {};
    return c.json({
      approval_id: approval.approval_id,
      status: approval.status,
      trace_id: approval.trace_id,
      tool_name: approval.tool_name,
      event_id: approval.event_id,
      approved_action_digest:
        typeof meta.approved_action_digest === "string"
          ? meta.approved_action_digest
          : null,
    });
  } finally {
    client.release();
  }
}

/**
 * Claude §13.2 — resume gate: intended execution payload must match the
 * digest frozen when the human approved.
 */
export async function postApprovalBindCheck(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const approvalId = c.req.param("approvalId");
  if (!approvalId) {
    return c.json({ error: "approvalId required" }, 422);
  }

  let body: { payload?: Record<string, unknown> };
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

    const approval = await getApproval(client, auth.organizationId, approvalId);
    if (!approval) {
      return c.json({ error: "Not found" }, 404);
    }
    if (approval.status !== "approved") {
      return c.json({ error: "Approval not approved", match: false }, 409);
    }

    const meta =
      approval.metadata &&
      typeof approval.metadata === "object" &&
      !Array.isArray(approval.metadata)
        ? (approval.metadata as Record<string, unknown>)
        : {};
    const boundDigest =
      typeof meta.approved_action_digest === "string"
        ? meta.approved_action_digest
        : null;
    const boundSnapshot =
      meta.approved_action_snapshot &&
      typeof meta.approved_action_snapshot === "object" &&
      !Array.isArray(meta.approved_action_snapshot)
        ? (meta.approved_action_snapshot as Record<string, unknown>)
        : null;

    // Legacy approvals without a digest: allow once, but report unbound.
    if (!boundDigest || !boundSnapshot) {
      return c.json({
        ok: true,
        match: true,
        unbound: true,
        detail: "Approval has no bound action digest (legacy).",
      });
    }

    const { match, intendedSnapshot } = approvedActionMatches(
      boundSnapshot,
      body.payload ?? {},
    );
    const { digest } = digestActionPayload(body.payload ?? {});
    if (!match) {
      return c.json(
        {
          ok: false,
          match: false,
          unbound: false,
          approved_action_digest: boundDigest,
          intended_digest: digest,
          intended_snapshot: intendedSnapshot,
          detail:
            "Approved action does not match intended execution. Approval is invalid.",
        },
        409,
      );
    }

    return c.json({
      ok: true,
      match: true,
      unbound: false,
      approved_action_digest: boundDigest,
      detail: "Approved action matches executed action: Yes.",
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

    if (body.trace_id && body.trace_id !== approval.trace_id) {
      return c.json({ error: "trace_id does not match approval" }, 409);
    }
    const traceId = approval.trace_id;
    await completeTrace(client, auth.organizationId, traceId);
    return c.json({ ok: true, trace_id: traceId, status: "completed" });
  } finally {
    client.release();
  }
}
