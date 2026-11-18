/**
 * Console Sources API (admin only): the registry of systems allowed to send signed events.
 *
 *   GET  /sources
 *   POST /sources                                 register a source with its first key
 *   POST /sources/:sourceId/keys                  add a key (rotation)
 *   POST /sources/:sourceId/keys/:keyId/revoke    { reason }
 *   GET  /sources/:sourceId/history
 */
import { Hono, type Context } from "hono";
import type { ConsoleSession } from "@salanor/platform-auth";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import {
  addSourceKey,
  countSequenceGaps,
  getSource,
  keyFingerprint,
  listRegistryEvents,
  listSequenceGaps,
  listSourceKeys,
  listSources,
  RegistryError,
  registerSource,
  revokeSourceKey,
  type SourceKeyRow,
  type SourceRow,
} from "../../sources/registry.js";

export const sourceRoutes = new Hono<{ Variables: ConsoleVariables }>();

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function serializeKey(k: SourceKeyRow) {
  return {
    key_id: k.key_id,
    source_id: k.source_id,
    public_key_b64: k.public_key_b64,
    fingerprint: keyFingerprint(k.public_key_b64),
    status: k.status,
    valid_from: iso(k.valid_from),
    valid_to: iso(k.valid_to),
    created_by: k.created_by,
    revoked_by: k.revoked_by,
    reason: k.reason,
    created_at: iso(k.created_at),
  };
}

function serializeSource(
  s: SourceRow,
  keys: SourceKeyRow[],
  openGaps: number,
) {
  const now = Date.now();
  const active =
    keys.find(
      (k) =>
        k.status === "active" &&
        k.valid_from.getTime() <= now &&
        (!k.valid_to || k.valid_to.getTime() > now),
    ) ?? null;
  return {
    source_id: s.source_id,
    name: s.name,
    kind: s.kind,
    owner_contact: s.owner_contact,
    status: s.status,
    last_seq: s.last_seq,
    last_event_at: iso(s.last_event_at),
    created_at: iso(s.created_at),
    updated_at: iso(s.updated_at),
    active_key: active ? serializeKey(active) : null,
    keys: keys.map(serializeKey),
    open_gap_count: openGaps,
  };
}

function adminOnly(c: Context<{ Variables: ConsoleVariables }>): ConsoleSession | Response {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return session;
}

function registryErrorResponse(
  c: Context<{ Variables: ConsoleVariables }>,
  err: unknown,
): Response | null {
  if (!(err instanceof RegistryError)) return null;
  const status =
    err.code === "not_found"
      ? 404
      : err.code === "conflict" || err.code === "already_revoked"
        ? 409
        : 422;
  return c.json({ error: err.message, code: err.code }, status);
}

async function readJson(
  c: Context<{ Variables: ConsoleVariables }>,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function param(c: Context<{ Variables: ConsoleVariables }>, name: string): string {
  return c.req.param(name) ?? "";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Optional ISO timestamp. Returns undefined when absent, null when present but invalid. */
function optionalDate(v: unknown): Date | undefined | null {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

sourceRoutes.get("/sources", requireConsoleSession, async (c) => {
  const gate = adminOnly(c);
  if (gate instanceof Response) return gate;
  const pool = getPool();
  const [sources, keys, gapCounts] = await Promise.all([
    listSources(pool, gate.organizationId),
    listSourceKeys(pool, gate.organizationId),
    countSequenceGaps(pool, gate.organizationId),
  ]);
  const keysBySource = new Map<string, SourceKeyRow[]>();
  for (const k of keys) {
    const list = keysBySource.get(k.source_id) ?? [];
    list.push(k);
    keysBySource.set(k.source_id, list);
  }
  return c.json({
    sources: sources.map((s) =>
      serializeSource(s, keysBySource.get(s.source_id) ?? [], gapCounts.get(s.source_id) ?? 0),
    ),
  });
});

sourceRoutes.post("/sources", requireConsoleSession, async (c) => {
  const gate = adminOnly(c);
  if (gate instanceof Response) return gate;
  const body = await readJson(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 422);

  for (const field of ["source_id", "name", "kind", "public_key_b64", "key_id"]) {
    if (!str(body[field]).trim()) {
      return c.json({ error: `${field} required` }, 422);
    }
  }
  const validFrom = optionalDate(body.valid_from);
  if (validFrom === null) {
    return c.json({ error: "valid_from must be an ISO-8601 timestamp" }, 422);
  }

  const client = await getPool().connect();
  try {
    const { source, key } = await registerSource(client, {
      organization_id: gate.organizationId,
      source_id: str(body.source_id).trim(),
      name: str(body.name),
      kind: str(body.kind).trim(),
      owner_contact: typeof body.owner_contact === "string" ? body.owner_contact : null,
      key_id: str(body.key_id).trim(),
      public_key_b64: str(body.public_key_b64),
      valid_from: validFrom,
      actor: gate.email,
    });
    await auditFromConsoleSession(client, gate, {
      action: "source.registered",
      resourceType: "source",
      resourceId: source.source_id,
      metadata: { kind: source.kind, key_id: key.key_id },
    });
    return c.json({ source: serializeSource(source, [key], 0) }, 201);
  } catch (err) {
    const handled = registryErrorResponse(c, err);
    if (handled) return handled;
    throw err;
  } finally {
    client.release();
  }
});

sourceRoutes.post("/sources/:sourceId/keys", requireConsoleSession, async (c) => {
  const gate = adminOnly(c);
  if (gate instanceof Response) return gate;
  const sourceId = param(c, "sourceId");
  const body = await readJson(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 422);
  for (const field of ["key_id", "public_key_b64"]) {
    if (!str(body[field]).trim()) {
      return c.json({ error: `${field} required` }, 422);
    }
  }
  const validFrom = optionalDate(body.valid_from);
  if (validFrom === null) {
    return c.json({ error: "valid_from must be an ISO-8601 timestamp" }, 422);
  }

  const client = await getPool().connect();
  try {
    const { key, retired } = await addSourceKey(client, {
      organization_id: gate.organizationId,
      source_id: sourceId,
      key_id: str(body.key_id).trim(),
      public_key_b64: str(body.public_key_b64),
      valid_from: validFrom,
      retire_previous:
        typeof body.retire_previous === "boolean" ? body.retire_previous : undefined,
      actor: gate.email,
    });
    await auditFromConsoleSession(client, gate, {
      action: "source.key_added",
      resourceType: "source",
      resourceId: sourceId,
      metadata: { key_id: key.key_id, retired },
    });
    return c.json({ key: serializeKey(key), retired_key_ids: retired }, 201);
  } catch (err) {
    const handled = registryErrorResponse(c, err);
    if (handled) return handled;
    throw err;
  } finally {
    client.release();
  }
});

sourceRoutes.post(
  "/sources/:sourceId/keys/:keyId/revoke",
  requireConsoleSession,
  async (c) => {
    const gate = adminOnly(c);
    if (gate instanceof Response) return gate;
    const sourceId = param(c, "sourceId");
    const keyId = param(c, "keyId");
    const body = await readJson(c);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);
    const reason = str(body.reason).trim();
    if (!reason) return c.json({ error: "reason required" }, 422);

    const client = await getPool().connect();
    try {
      const key = await revokeSourceKey(client, {
        organization_id: gate.organizationId,
        source_id: sourceId,
        key_id: keyId,
        reason,
        actor: gate.email,
      });
      await auditFromConsoleSession(client, gate, {
        action: "source.key_revoked",
        resourceType: "source",
        resourceId: sourceId,
        metadata: { key_id: keyId, reason },
      });
      return c.json({ key: serializeKey(key) });
    } catch (err) {
      const handled = registryErrorResponse(c, err);
      if (handled) return handled;
      throw err;
    } finally {
      client.release();
    }
  },
);

sourceRoutes.get("/sources/:sourceId/history", requireConsoleSession, async (c) => {
  const gate = adminOnly(c);
  if (gate instanceof Response) return gate;
  const sourceId = param(c, "sourceId");
  const pool = getPool();
  const source = await getSource(pool, gate.organizationId, sourceId);
  if (!source) return c.json({ error: "Source not found" }, 404);
  const [events, keys, gaps] = await Promise.all([
    listRegistryEvents(pool, gate.organizationId, sourceId),
    listSourceKeys(pool, gate.organizationId, sourceId),
    listSequenceGaps(pool, gate.organizationId, sourceId),
  ]);
  return c.json({
    source: serializeSource(source, keys, gaps.length),
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      key_id: e.key_id,
      actor: e.actor,
      detail: e.detail,
      created_at: iso(e.created_at),
    })),
    gaps: gaps.map((g) => ({
      from_seq: g.from_seq,
      to_seq: g.to_seq,
      detected_at: iso(g.detected_at),
    })),
  });
});
