import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getPool } from "../../db/pool.js";
import { authenticateDevUser } from "../../console/dev-login.js";
import {
  auditAuthLoginDenied,
  auditAuthLoginFailed,
  auditAuthLoginSuccess,
  auditAuthLogout,
  createSession,
  deleteSession,
  getAccountPlatformRole,
  isEmailVerified,
  resolveSession,
  SALANOR_SESSION_COOKIE,
  sessionCookieOptions,
  type ConsoleSession,
} from "@salanor/platform-auth";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import {
  assertCanCreateIngestKey,
  checkRateLimit,
  getClientIp,
  loginRateLimitKey,
  PlanLimitError,
  rateLimitResponse,
  readRateLimitEnv,
} from "@salanor/platform-auth";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import {
  createIngestKey,
  listIngestKeys,
  renameIngestKey,
  revokeIngestKey,
} from "../../repo/ingest-keys.js";
import { getOrgGovernanceInsights } from "../../insights/governance-insights.js";
import { getEventById, listEventsByTrace } from "../../repo/events.js";
import type { TraceListFilters, TraceSummary } from "../../repo/traces.js";
import {
  countTracesByOrganization,
  getTraceById,
  listTracesByOrganization,
} from "../../repo/traces.js";
import type { EventDetail } from "../../repo/events.js";
import { enrichProvenancePayload } from "../../ingest/enrich-payload.js";
import { computeChainRootHash } from "../../trace/chain-root.js";
import { buildProvenanceClaim } from "../../trace/provenance-claim.js";
import {
  listAuditLogs,
  listDistinctAuditActions,
} from "../../repo/audit-logs.js";
import { searchOrganizationEvents } from "../../repo/search.js";
import {
  buildSpanTree,
  listSpansByTrace,
  type SpanWithEvents,
} from "../../repo/spans.js";
import { buildReplayManifest } from "../../trace/replay-manifest.js";
import { groupEventsIntoSpans } from "../../trace/span-grouping.js";
import { agentRoutes } from "./agents.js";
import { organizationRoutes } from "./organization.js";
import { policyRoutes } from "./policies.js";
import { approvalRoutes } from "./approvals.js";
import { verifyRoutes } from "./verify.js";
import { exportRoutes } from "./exports.js";
import { siemRoutes } from "./siem.js";

const LEGACY_SESSION_COOKIE = "aegis_session";

function serializeTrace(row: TraceSummary) {
  const startedAt = row.started_at.toISOString();
  return {
    trace_id: row.trace_id,
    agent_id: row.agent_id,
    status: row.status,
    started_at: startedAt,
    ended_at: row.ended_at?.toISOString() ?? null,
    total_events: row.total_events,
    denied_events: row.denied_events,
    root_event_id: row.root_event_id,
    root_event_hash: row.root_event_hash,
    chain_root_hash: computeChainRootHash({
      traceId: row.trace_id,
      agentId: row.agent_id,
      startedAt,
    }),
  };
}

function serializeEvent(row: EventDetail) {
  const emittedAt = row.emitted_at.toISOString();
  const rawPayload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  const payloadEnriched = enrichProvenancePayload({
    payload: rawPayload,
    toolName: row.tool_name,
    actionKind: row.action_kind,
    policyId: row.policy_id,
  });
  const provenance = buildProvenanceClaim({
    agentId: row.agent_id,
    actorType: row.actor_type,
    actorPrincipal: row.actor_principal,
    actionKind: row.action_kind,
    policyDecision: row.policy_decision,
    toolName: row.tool_name,
    policyId: row.policy_id,
    emittedAt,
    payload: payloadEnriched,
  });
  const spanId =
    row.span_id ??
    (typeof rawPayload.span_id === "string" ? rawPayload.span_id : null);
  return {
    event_id: row.event_id,
    trace_id: row.trace_id,
    span_id: spanId,
    agent_id: row.agent_id,
    action_kind: row.action_kind,
    policy_decision: row.policy_decision,
    tool_name: row.tool_name,
    sequence_num: Number(row.sequence_num),
    event_hash: row.event_hash,
    prev_event_hash: row.prev_event_hash,
    chain_valid: row.chain_valid,
    emitted_at: emittedAt,
    ingested_at: row.ingested_at.toISOString(),
    payload: row.payload,
    payload_enriched: payloadEnriched,
    provenance_claim: provenance.claim,
    provenance_authority: provenance.authority,
  };
}

type SerializedSpanTree = {
  span_id: string;
  parent_span_id: string | null;
  label: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  events: SpanWithEvents["events"];
  child_spans: SerializedSpanTree[];
};

function serializeSpanTree(nodes: SpanWithEvents[]): SerializedSpanTree[] {
  return nodes.map((n) => ({
    span_id: n.span_id,
    parent_span_id: n.parent_span_id,
    label: n.label,
    status: n.status,
    started_at: n.started_at.toISOString(),
    ended_at: n.ended_at?.toISOString() ?? null,
    events: n.events,
    child_spans: serializeSpanTree(n.child_spans),
  }));
}

function parseTraceListFilters(c: {
  req: { query: (key: string) => string | undefined };
}): TraceListFilters {
  const q = c.req.query("q")?.trim();
  const agentId = c.req.query("agent_id")?.trim();
  const status = c.req.query("status")?.trim();
  const fromRaw = c.req.query("from");
  const toRaw = c.req.query("to");
  const limitRaw = Number(c.req.query("limit") ?? "50");
  const pageRaw = Number(c.req.query("page") ?? "1");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
    : 50;
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const filters: TraceListFilters = {
    limit,
    offset: (page - 1) * limit,
  };
  if (q) filters.q = q;
  if (agentId) filters.agentId = agentId;
  if (status) filters.status = status;
  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) filters.from = from;
  }
  if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) filters.to = to;
  }
  return filters;
}

export const consoleRoutes = new Hono<{ Variables: ConsoleVariables }>();

consoleRoutes.route("/", agentRoutes);
consoleRoutes.route("/", organizationRoutes);
consoleRoutes.route("/", policyRoutes);
consoleRoutes.route("/", approvalRoutes);
consoleRoutes.route("/", verifyRoutes);
consoleRoutes.route("/", exportRoutes);
consoleRoutes.route("/", siemRoutes);

consoleRoutes.post("/auth/login", async (c) => {
  const ip = getClientIp(c.req.raw.headers);
  const loginLimit = readRateLimitEnv("LOGIN_RATE_LIMIT", 20);
  const windowMs = readRateLimitEnv("LOGIN_RATE_WINDOW_MS", 900_000);
  const rl = checkRateLimit(loginRateLimitKey(ip), { limit: loginLimit, windowMs });
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec);
  }

  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.email || !body.password) {
    return c.json({ error: "email and password required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const email = body.email.trim().toLowerCase();
    const auth = await authenticateDevUser(client, email, body.password);
    if (!auth) {
      await auditAuthLoginFailed(client, {
        email,
        reason: "invalid_credentials",
        ip,
      });
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const platformRole = await getAccountPlatformRole(client, auth.accountId);
    if (platformRole == null) {
      const verified = await isEmailVerified(client, auth.accountId);
      if (!verified) {
        await auditAuthLoginDenied(client, {
          email,
          reason: "email_unverified",
          code: "email_unverified",
          ip,
        });
        return c.json(
          {
            error: "Verify your email before signing in.",
            code: "email_unverified",
          },
          403,
        );
      }
    }

    const { token, session } = await createSession(
      client,
      auth.accountId,
      auth.organizationId,
    );
    await auditAuthLoginSuccess(client, {
      organizationId: session.organizationId,
      membershipId: session.userId,
      email: session.email,
      ip,
      source: "aegis-console",
    });
    setCookie(c, SALANOR_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
    setCookie(c, LEGACY_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
    return c.json({ user: serializeUser(session) });
  } finally {
    client.release();
  }
});

consoleRoutes.post("/auth/logout", async (c) => {
  const token =
    getCookie(c, SALANOR_SESSION_COOKIE) ?? getCookie(c, LEGACY_SESSION_COOKIE);
  if (token) {
    const client = await getPool().connect();
    try {
      const session = await resolveSession(client, token);
      if (session) {
        await auditAuthLogout(client, {
          organizationId: session.organizationId,
          membershipId: session.userId,
          email: session.email,
          source: "aegis-console",
        });
      }
      await deleteSession(client, token);
    } finally {
      client.release();
    }
  }
  deleteCookie(c, SALANOR_SESSION_COOKIE, { path: "/" });
  deleteCookie(c, LEGACY_SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

consoleRoutes.get("/auth/me", requireConsoleSession, async (c) => {
  return c.json({ user: serializeUser(c.get("consoleSession")) });
});

consoleRoutes.get("/insights", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const insights = await getOrgGovernanceInsights(getPool(), orgId);
  return c.json({ insights });
});

consoleRoutes.get("/traces", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const filters = parseTraceListFilters(c);
  const pool = getPool();
  const [traces, total] = await Promise.all([
    listTracesByOrganization(pool, orgId, filters),
    countTracesByOrganization(pool, orgId, filters),
  ]);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  return c.json({
    traces: traces.map(serializeTrace),
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
  });
});

consoleRoutes.get("/search", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const q = c.req.query("q")?.trim() ?? "";
  const limit = Math.min(
    Math.max(Number(c.req.query("limit") ?? "25"), 1),
    100,
  );
  const page = Math.max(Number(c.req.query("page") ?? "1"), 1);
  const offset = (page - 1) * limit;
  const { hits, total } = await searchOrganizationEvents(
    getPool(),
    orgId,
    q,
    limit,
    offset,
  );
  return c.json({
    query: q,
    hits: hits.map((h) => ({
      event_id: h.event_id,
      trace_id: h.trace_id,
      agent_id: h.agent_id,
      action_kind: h.action_kind,
      policy_decision: h.policy_decision,
      tool_name: h.tool_name,
      emitted_at: h.emitted_at.toISOString(),
      rank: h.rank,
    })),
    total,
    page,
    limit,
  });
});

consoleRoutes.get("/traces/:traceId/replay", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const traceId = c.req.param("traceId");
  if (!traceId) {
    return c.json({ error: "traceId required" }, 422);
  }
  const events = await listEventsByTrace(getPool(), orgId, traceId);
  if (events.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(buildReplayManifest(events));
});

consoleRoutes.get("/traces/:traceId", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const traceId = c.req.param("traceId");
  if (!traceId) {
    return c.json({ error: "traceId required" }, 422);
  }
  const trace = await getTraceById(getPool(), orgId, traceId);
  if (!trace) {
    return c.json({ error: "Not found" }, 404);
  }
  const pool = getPool();
  const events = await listEventsByTrace(pool, orgId, traceId);
  const serialized = events.map(serializeEvent);
  const byId = new Map(serialized.map((e) => [e.event_id, e]));
  const spanRows = await listSpansByTrace(pool, orgId, traceId);
  const eventsBySpan = new Map<
    string,
    Array<{
      event_id: string;
      sequence_num: number;
      action_kind: string;
      policy_decision: string;
      tool_name: string | null;
      emitted_at: string;
    }>
  >();
  for (const e of serialized) {
    if (!e.span_id) {
      continue;
    }
    const list = eventsBySpan.get(e.span_id) ?? [];
    list.push({
      event_id: e.event_id,
      sequence_num: e.sequence_num,
      action_kind: e.action_kind,
      policy_decision: e.policy_decision,
      tool_name: e.tool_name,
      emitted_at: e.emitted_at,
    });
    eventsBySpan.set(e.span_id, list);
  }
  const spanTree = buildSpanTree(spanRows, eventsBySpan);
  const spanGroups = groupEventsIntoSpans(
    serialized.map((e) => ({
      event_id: e.event_id,
      sequence_num: e.sequence_num,
      action_kind: e.action_kind,
      policy_decision: e.policy_decision,
      tool_name: e.tool_name,
      payload: e.payload_enriched ?? e.payload,
    })),
  );
  return c.json({
    trace: serializeTrace(trace),
    events: serialized,
    span_tree: serializeSpanTree(spanTree),
    spans: spanGroups.map((g) => ({
      span_id: g.span_id,
      label: g.label,
      events: g.events
        .map((e) => byId.get(e.event_id))
        .filter((e): e is NonNullable<typeof e> => e != null),
    })),
  });
});

consoleRoutes.get("/events/:eventId", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const eventId = c.req.param("eventId");
  if (!eventId) {
    return c.json({ error: "eventId required" }, 422);
  }
  const event = await getEventById(getPool(), orgId, eventId);
  if (!event) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ event: serializeEvent(event) });
});

consoleRoutes.get("/audit-logs/actions", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const actions = await listDistinctAuditActions(getPool(), orgId);
  return c.json({ actions });
});

consoleRoutes.get("/audit-logs", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const q = c.req.query("q")?.trim();
  const action = c.req.query("action")?.trim();
  const limitRaw = Number(c.req.query("limit") ?? "25");
  const pageRaw = Number(c.req.query("page") ?? "1");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
    : 25;
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const { logs, total } = await listAuditLogs(getPool(), orgId, {
    q: q || undefined,
    action: action || undefined,
    limit,
    offset: (page - 1) * limit,
  });

  return c.json({
    logs: logs.map((row) => ({
      audit_id: row.audit_id,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      metadata: row.metadata,
      created_at: row.created_at.toISOString(),
      actor_email: row.actor_email,
    })),
    total,
    page,
    limit,
  });
});

consoleRoutes.get("/ingest-keys", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const keys = await listIngestKeys(getPool(), orgId);
  return c.json({
    keys: keys.map((k) => ({
      key_id: k.key_id,
      name: k.name,
      key_prefix: k.key_prefix,
      active: k.active,
      created_at: k.created_at.toISOString(),
      last_used_at: k.last_used_at?.toISOString() ?? null,
      revoked_at: k.revoked_at?.toISOString() ?? null,
    })),
  });
});

consoleRoutes.post("/ingest-keys", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.name?.trim()) {
    return c.json({ error: "name required" }, 422);
  }

  try {
    await assertCanCreateIngestKey(getPool(), session.organizationId);
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return c.json(
        { error: error.message, code: error.code },
        error.httpStatus as 402 | 403 | 404 | 429,
      );
    }
    throw error;
  }

  const pool = getPool();
  const { row, rawKey } = await createIngestKey(
    pool,
    session.organizationId,
    body.name.trim(),
  );
  await auditFromConsoleSession(pool, session, {
    action: "ingest_key.created",
    resourceType: "ingest_key",
    resourceId: row.key_id,
    metadata: { name: row.name, key_prefix: row.key_prefix },
  });
  return c.json(
    {
      key: {
        key_id: row.key_id,
        name: row.name,
        key_prefix: row.key_prefix,
        active: row.active,
      },
      secret: rawKey,
    },
    201,
  );
});

consoleRoutes.patch("/ingest-keys/:keyId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const keyId = c.req.param("keyId");
  if (!keyId) {
    return c.json({ error: "keyId required" }, 422);
  }
  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.name?.trim()) {
    return c.json({ error: "name required" }, 422);
  }
  const pool = getPool();
  const row = await renameIngestKey(
    pool,
    session.organizationId,
    keyId,
    body.name.trim(),
  );
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  await auditFromConsoleSession(pool, session, {
    action: "ingest_key.renamed",
    resourceType: "ingest_key",
    resourceId: row.key_id,
    metadata: { name: row.name },
  });
  return c.json({
    key: {
      key_id: row.key_id,
      name: row.name,
      key_prefix: row.key_prefix,
      active: row.active,
      created_at: row.created_at.toISOString(),
      last_used_at: row.last_used_at?.toISOString() ?? null,
    },
  });
});

consoleRoutes.delete("/ingest-keys/:keyId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const keyId = c.req.param("keyId");
  if (!keyId) {
    return c.json({ error: "keyId required" }, 422);
  }
  const pool = getPool();
  const revoked = await revokeIngestKey(pool, session.organizationId, keyId);
  if (!revoked) {
    return c.json({ error: "Not found" }, 404);
  }
  await auditFromConsoleSession(pool, session, {
    action: "ingest_key.revoked",
    resourceType: "ingest_key",
    resourceId: keyId,
  });
  return c.json({ ok: true });
});

function serializeUser(session: ConsoleSession) {
  return {
    user_id: session.userId,
    organization_id: session.organizationId,
    email: session.email,
    display_name: session.displayName,
    role: session.role,
  };
}
