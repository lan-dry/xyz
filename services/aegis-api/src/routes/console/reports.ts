import { Hono } from "hono";
import {
  exportCannedReportCsv,
  getCannedReport,
  listCannedReports,
  previewCannedReport,
  type CannedReportId,
} from "../../forensic/canned-reports.js";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

/** Roles allowed to list/export canned forensic reports. */
export const REPORT_READ_ROLES = new Set(["admin", "owner", "auditor"]);

export function canExportReports(role: string): boolean {
  return REPORT_READ_ROLES.has(role.trim().toLowerCase());
}

export const reportRoutes = new Hono<{ Variables: ConsoleVariables }>();

reportRoutes.get("/reports/canned", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (!canExportReports(session.role)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const from = c.req.query("from")?.trim() || null;
  const to = c.req.query("to")?.trim() || null;
  const outcome = c.req.query("outcome")?.trim() || null;
  return c.json({
    stub: false,
    filters: { from, to, outcome },
    reports: listCannedReports(),
  });
});

/** First rows and total count, so people see what the CSV holds before downloading. */
reportRoutes.get(
  "/reports/canned/:reportId/preview",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canExportReports(session.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const reportId = c.req.param("reportId")?.trim() ?? "";
    if (!getCannedReport(reportId)) {
      return c.json({ error: "Unknown report", code: "unknown_report" }, 404);
    }
    const limitRaw = Number(c.req.query("limit") ?? "10");
    const preview = await previewCannedReport(
      getPool(),
      session.organizationId,
      reportId as CannedReportId,
      Number.isFinite(limitRaw) ? limitRaw : 10,
    );
    return c.json({ preview });
  },
);

reportRoutes.get(
  "/reports/canned/:reportId/csv",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canExportReports(session.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const reportId = c.req.param("reportId")?.trim() ?? "";
    const def = getCannedReport(reportId);
    if (!def) {
      return c.json({ error: "Unknown report", code: "unknown_report" }, 404);
    }

    const limitRaw = Number(c.req.query("limit") ?? "5000");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 5000;

    const { csv } = await exportCannedReportCsv(
      getPool(),
      session.organizationId,
      reportId as CannedReportId,
      limit,
    );

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${def.id}.csv"`,
      },
    });
  },
);
