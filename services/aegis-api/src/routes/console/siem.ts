import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import {
  createSiemDestination,
  isSiemProvider,
  listSiemDestinations,
  updateSiemDestination,
} from "../../repo/siem-destinations.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function serializeDestination(row: {
  dest_id: string;
  provider: string;
  otel_endpoint: string | null;
  status: string;
  last_flushed_at: Date | null;
  created_at: Date;
}) {
  return {
    dest_id: row.dest_id,
    provider: row.provider,
    otel_endpoint: row.otel_endpoint,
    status: row.status,
    last_flushed_at: row.last_flushed_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

export const siemRoutes = new Hono<{ Variables: ConsoleVariables }>();

siemRoutes.get("/siem/destinations", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const rows = await listSiemDestinations(getPool(), session.organizationId);
  return c.json({ destinations: rows.map(serializeDestination) });
});

siemRoutes.post("/siem/destinations", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  let body: { provider?: string; otel_endpoint?: string; dest_id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.provider || !body.otel_endpoint?.trim()) {
    return c.json({ error: "provider and otel_endpoint required" }, 422);
  }
  if (!isSiemProvider(body.provider)) {
    return c.json(
      { error: "provider must be splunk, datadog, or sentinel" },
      422,
    );
  }
  const row = await createSiemDestination(getPool(), {
    organizationId: session.organizationId,
    provider: body.provider,
    otelEndpoint: body.otel_endpoint,
    destId: body.dest_id,
  });
  return c.json({ destination: serializeDestination(row) }, 201);
});

siemRoutes.patch("/siem/destinations/:destId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  let body: { status?: string; otel_endpoint?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const patch: { status?: "active" | "paused"; otelEndpoint?: string } = {};
  if (body.status === "active" || body.status === "paused") {
    patch.status = body.status;
  }
  if (body.otel_endpoint !== undefined) {
    patch.otelEndpoint = body.otel_endpoint;
  }
  const destId = c.req.param("destId");
  if (!destId) {
    return c.json({ error: "destId required" }, 422);
  }
  const row = await updateSiemDestination(
    getPool(),
    session.organizationId,
    destId,
    patch,
  );
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ destination: serializeDestination(row) });
});
