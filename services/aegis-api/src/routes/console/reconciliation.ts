/**
 * Console reconciliation feeds + runs (Stage 4).
 *
 *   GET  /reconciliation/feeds
 *   POST /reconciliation/feeds
 *   POST /reconciliation/feeds/:feedId/ingest
 *   GET  /reconciliation/runs
 *   POST /reconciliation/runs
 *   GET  /reconciliation/runs/:runId
 *   GET  /reconciliation/runs/:runId/report.json
 *   GET  /reconciliation/runs/:runId/report.pdf
 */
import { Hono } from "hono";
import { canWriteOrgConsole } from "@salanor/platform-auth";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import {
  createFeed,
  FeedIngestError,
  getFeed,
  ingestFeedBody,
  listFeeds,
} from "../../reconciliation/ingest.js";
import { renderReconciliationPdf } from "../../reconciliation/report.js";
import {
  getRun,
  listRuns,
  runReconciliation,
} from "../../reconciliation/run.js";
import type { ReconciliationReport } from "../../reconciliation/types.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const reconciliationRoutes = new Hono<{ Variables: ConsoleVariables }>();

reconciliationRoutes.get(
  "/reconciliation/feeds",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const feeds = await listFeeds(getPool(), orgId);
    return c.json({
      feeds: feeds.map((f) => ({
        feed_id: f.feed_id,
        name: f.name,
        source_id: f.source_id,
        match_key: f.match_key,
        column_mapping: f.column_mapping,
        expected_interval_sec: f.expected_interval_sec,
        schedule_enabled: f.schedule_enabled,
        schedule_hour_utc: f.schedule_hour_utc,
        last_scheduled_at: f.last_scheduled_at?.toISOString() ?? null,
        status: f.status,
      })),
    });
  },
);

reconciliationRoutes.post(
  "/reconciliation/feeds",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canWriteOrgConsole(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const matchKey =
      body.match_key === "token_id" || body.match_key === "case_id"
        ? body.match_key
        : null;
    if (!name || !matchKey) {
      return c.json(
        { error: "name and match_key (case_id|token_id) are required" },
        422,
      );
    }
    const feed = await createFeed(getPool(), {
      organization_id: session.organizationId,
      name,
      match_key: matchKey,
      column_mapping: body.column_mapping,
      source_id:
        typeof body.source_id === "string" ? body.source_id : null,
      expected_interval_sec:
        typeof body.expected_interval_sec === "number"
          ? body.expected_interval_sec
          : null,
      schedule_enabled: body.schedule_enabled !== false,
      schedule_hour_utc:
        typeof body.schedule_hour_utc === "number"
          ? body.schedule_hour_utc
          : 2,
      feed_id: typeof body.feed_id === "string" ? body.feed_id : undefined,
    });
    await auditFromConsoleSession(getPool(), session, {
      action: "reconciliation.feed.create",
      resourceType: "reconciliation_feed",
      resourceId: feed.feed_id,
      metadata: { name: feed.name },
    });
    return c.json({ feed }, 201);
  },
);

reconciliationRoutes.post(
  "/reconciliation/feeds/:feedId/ingest",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canWriteOrgConsole(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
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
        session.organizationId,
        feedId,
        bodyText,
        formatHint,
      );
      await auditFromConsoleSession(getPool(), session, {
        action: "reconciliation.feed.ingest",
        resourceType: "reconciliation_feed",
        resourceId: feedId,
        metadata: {
          inserted: result.inserted,
          unchanged: result.unchanged,
          edited: result.edited,
        },
      });
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
  },
);

reconciliationRoutes.get(
  "/reconciliation/runs",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const runs = await listRuns(getPool(), orgId);
    return c.json({
      runs: runs.map((r) => ({
        ...r,
        period_start: r.period_start.toISOString(),
        period_end: r.period_end.toISOString(),
        started_at: r.started_at.toISOString(),
        finished_at: r.finished_at?.toISOString() ?? null,
      })),
    });
  },
);

reconciliationRoutes.post(
  "/reconciliation/runs",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canWriteOrgConsole(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const periodStart =
      typeof body.period_start === "string" ? body.period_start : null;
    const periodEnd =
      typeof body.period_end === "string" ? body.period_end : null;
    if (!periodStart || !periodEnd) {
      return c.json(
        { error: "period_start and period_end (ISO) are required" },
        422,
      );
    }
    const feedId =
      typeof body.feed_id === "string" && body.feed_id.trim()
        ? body.feed_id.trim()
        : null;
    if (feedId) {
      const feed = await getFeed(getPool(), session.organizationId, feedId);
      if (!feed) return c.json({ error: "Feed not found" }, 404);
    }
    const result = await runReconciliation(getPool(), {
      organization_id: session.organizationId,
      feed_id: feedId,
      period_start: periodStart,
      period_end: periodEnd,
      trigger: "on_demand",
      created_by: session.email,
    });
    await auditFromConsoleSession(getPool(), session, {
      action: "reconciliation.run",
      resourceType: "reconciliation_run",
      resourceId: result.run_id,
      metadata: {
        matched: result.report.matched_count,
        exceptions: result.report.exception_count,
      },
    });
    return c.json(
      {
        run_id: result.run_id,
        report: result.report,
      },
      201,
    );
  },
);

reconciliationRoutes.get(
  "/reconciliation/runs/:runId",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const runId = c.req.param("runId");
    if (!runId) return c.json({ error: "runId required" }, 422);
    const run = await getRun(getPool(), orgId, runId);
    if (!run) return c.json({ error: "Not found" }, 404);
    return c.json({
      run: {
        ...run,
        period_start: run.period_start.toISOString(),
        period_end: run.period_end.toISOString(),
        started_at: run.started_at.toISOString(),
        finished_at: run.finished_at?.toISOString() ?? null,
      },
    });
  },
);

reconciliationRoutes.get(
  "/reconciliation/runs/:runId/report.json",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const runId = c.req.param("runId");
    if (!runId) return c.json({ error: "runId required" }, 422);
    const run = await getRun(getPool(), orgId, runId);
    if (!run) return c.json({ error: "Not found" }, 404);
    if (!run.report) return c.json({ error: "Report not ready" }, 404);
    return c.json(run.report as ReconciliationReport);
  },
);

reconciliationRoutes.get(
  "/reconciliation/runs/:runId/report.pdf",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const runId = c.req.param("runId");
    if (!runId) return c.json({ error: "runId required" }, 422);
    const run = await getRun(getPool(), orgId, runId);
    if (!run) return c.json({ error: "Not found" }, 404);
    if (!run.report) return c.json({ error: "Report not ready" }, 404);
    const pdf = renderReconciliationPdf(run.report as ReconciliationReport);
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reconciliation-${run.run_id}.pdf"`,
      },
    });
  },
);
