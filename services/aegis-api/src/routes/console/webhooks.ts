import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  setWebhookEndpointActive,
} from "../../repo/webhook-endpoints.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { WEBHOOK_EVENT_TYPES, isWebhookEventType } from "../../webhooks/catalog.js";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";

function serializeEndpoint(row: {
  endpoint_id: string;
  url: string;
  events_filter: unknown;
  active: boolean;
  created_at: Date;
}) {
  let events: string[] | null = null;
  if (Array.isArray(row.events_filter)) {
    events = row.events_filter.filter((e): e is string => typeof e === "string");
  } else if (typeof row.events_filter === "string") {
    try {
      const parsed = JSON.parse(row.events_filter) as unknown;
      if (Array.isArray(parsed)) {
        events = parsed.filter((e): e is string => typeof e === "string");
      }
    } catch {
      events = null;
    }
  }
  return {
    endpoint_id: row.endpoint_id,
    url: row.url,
    events,
    active: row.active,
    created_at: row.created_at.toISOString(),
  };
}

export const webhookRoutes = new Hono<{ Variables: ConsoleVariables }>();

webhookRoutes.get("/webhooks/events", requireConsoleSession, async (c) => {
  return c.json({
    events: WEBHOOK_EVENT_TYPES.map((type) => ({
      type,
      description: webhookEventDescription(type),
    })),
  });
});

webhookRoutes.get("/webhooks/endpoints", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const rows = await listWebhookEndpoints(getPool(), session.organizationId);
  return c.json({ endpoints: rows.map(serializeEndpoint) });
});

webhookRoutes.post("/webhooks/endpoints", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  let body: { url?: string; events?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.url?.trim()) {
    return c.json({ error: "url required" }, 422);
  }
  const events = body.events?.filter((e) => isWebhookEventType(e));
  try {
    const pool = getPool();
    const { row, signingSecret } = await createWebhookEndpoint(pool, {
      organizationId: session.organizationId,
      url: body.url,
      events,
    });
    await auditFromConsoleSession(pool, session, {
      action: "webhook_endpoint.created",
      resourceType: "webhook_endpoint",
      resourceId: row.endpoint_id,
      metadata: { url: row.url, events: events ?? null },
    });
    return c.json(
      {
        endpoint: serializeEndpoint(row),
        signing_secret: signingSecret,
        message: "Copy the signing secret now. It will not be shown again.",
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create failed";
    return c.json({ error: message }, 422);
  }
});

webhookRoutes.patch(
  "/webhooks/endpoints/:endpointId",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (session.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    let body: { active?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (typeof body.active !== "boolean") {
      return c.json({ error: "active (boolean) required" }, 422);
    }
    const endpointId = c.req.param("endpointId");
    if (!endpointId) {
      return c.json({ error: "endpointId required" }, 422);
    }
    const pool = getPool();
    const row = await setWebhookEndpointActive(
      pool,
      session.organizationId,
      endpointId,
      body.active,
    );
    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }
    await auditFromConsoleSession(pool, session, {
      action: body.active ? "webhook_endpoint.activated" : "webhook_endpoint.paused",
      resourceType: "webhook_endpoint",
      resourceId: endpointId,
    });
    return c.json({ endpoint: serializeEndpoint(row) });
  },
);

function webhookEventDescription(type: string): string {
  switch (type) {
    case "approval.requested":
      return "An approval was created and is waiting for a decision.";
    case "approval.decided":
      return "An approval reached a final approved or rejected outcome.";
    case "policy.activated":
      return "A policy version was published and is now active.";
    case "agent.suspended":
      return "An agent was suspended by policy or an administrator.";
    case "event.denied":
      return "A governed action was denied by policy.";
    default:
      return "";
  }
}
