/**
 * Explicit allow-list of console + aegis routes for the role matrix.
 * Build fails (via test) if a registered route path pattern is missing here.
 */
export type RouteRule = {
  method: string;
  path: string;
  /** unauthenticated expected status */
  anon: 401 | 403 | 404 | 422;
  /** Roles that may succeed (others → 403 when authenticated as wrong role). */
  allowRoles: string[];
  /** Viewing a receipt through this route must write access log. */
  receiptAccessLog?: boolean;
};

export const CONSOLE_ROUTE_RULES: RouteRule[] = [
  { method: "GET", path: "/v1/console/auth/me", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/overview", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/approvals", anon: 401, allowRoles: ["approver", "admin", "owner", "auditor"] },
  { method: "GET", path: "/v1/console/policies", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/policies/:policyId/diff", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/authority-matrix", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/rules/versions", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "POST", path: "/v1/console/rules/preview", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/traces", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/events/:eventId", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"], receiptAccessLog: true },
  { method: "GET", path: "/v1/console/events/:eventId/verify", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"], receiptAccessLog: true },
  { method: "GET", path: "/v1/console/traces/:traceId/evidence-bundle", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"], receiptAccessLog: true },
  { method: "GET", path: "/v1/console/traces/:traceId/evidence-bundle.pdf", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"], receiptAccessLog: true },
  { method: "GET", path: "/v1/console/cases/summary", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/compliance/exports", anon: 401, allowRoles: ["admin", "owner", "auditor"] },
  { method: "GET", path: "/v1/console/reports/canned", anon: 401, allowRoles: ["admin", "owner", "auditor"] },
  { method: "GET", path: "/v1/console/reports/canned/:reportId/csv", anon: 401, allowRoles: ["admin", "owner", "auditor"] },
  { method: "GET", path: "/v1/console/reports/canned/:reportId/preview", anon: 401, allowRoles: ["admin", "owner", "auditor"] },
  { method: "GET", path: "/v1/console/logs", anon: 401, allowRoles: ["admin", "owner", "auditor"] },
  { method: "POST", path: "/v1/console/approvals/:id/approve", anon: 401, allowRoles: ["approver", "admin", "owner"] },
  { method: "POST", path: "/v1/console/approvals/:id/reject", anon: 401, allowRoles: ["approver", "admin", "owner"] },
  { method: "POST", path: "/v1/console/approvals/:id/release", anon: 401, allowRoles: ["approver", "admin", "owner"] },
  { method: "POST", path: "/v1/console/approvals/:id/escalate", anon: 401, allowRoles: ["approver", "admin", "owner"] },
  { method: "POST", path: "/v1/console/policies/:id/activate", anon: 401, allowRoles: ["admin", "owner"] },
  { method: "POST", path: "/v1/console/policies", anon: 401, allowRoles: ["admin", "owner"] },
  // Source registry (Stage 1 provenance): admin only. "owner" is not accepted by these routes.
  { method: "GET", path: "/v1/console/sources", anon: 401, allowRoles: ["admin"] },
  { method: "POST", path: "/v1/console/sources", anon: 401, allowRoles: ["admin"] },
  { method: "POST", path: "/v1/console/sources/:sourceId/keys", anon: 401, allowRoles: ["admin"] },
  { method: "POST", path: "/v1/console/sources/:sourceId/keys/:keyId/revoke", anon: 401, allowRoles: ["admin"] },
  { method: "POST", path: "/v1/console/sources/:sourceId/disable", anon: 401, allowRoles: ["admin"] },
  { method: "GET", path: "/v1/console/sources/:sourceId/history", anon: 401, allowRoles: ["admin"] },
  // Stage 4 reconciliation + exceptions
  { method: "GET", path: "/v1/console/exceptions", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/exceptions/:exceptionId", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "POST", path: "/v1/console/exceptions/:exceptionId/acknowledge", anon: 401, allowRoles: ["approver", "admin", "owner", "auditor"] },
  { method: "POST", path: "/v1/console/exceptions/:exceptionId/resolve", anon: 401, allowRoles: ["approver", "admin", "owner", "auditor"] },
  { method: "GET", path: "/v1/console/reconciliation/feeds", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "POST", path: "/v1/console/reconciliation/feeds", anon: 401, allowRoles: ["admin", "owner"] },
  { method: "POST", path: "/v1/console/reconciliation/feeds/:feedId/ingest", anon: 401, allowRoles: ["admin", "owner"] },
  { method: "GET", path: "/v1/console/reconciliation/runs", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "POST", path: "/v1/console/reconciliation/runs", anon: 401, allowRoles: ["admin", "owner"] },
  { method: "GET", path: "/v1/console/reconciliation/runs/:runId", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/reconciliation/runs/:runId/report.json", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"], receiptAccessLog: true },
  { method: "GET", path: "/v1/console/reconciliation/runs/:runId/report.pdf", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"], receiptAccessLog: true },
  // Gate 1 sandbox
  { method: "GET", path: "/v1/console/sandbox/status", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "POST", path: "/v1/console/sandbox/enable", anon: 401, allowRoles: ["admin", "owner"] },
  { method: "POST", path: "/v1/console/sandbox/reset", anon: 401, allowRoles: ["admin", "owner"] },
  { method: "POST", path: "/v1/console/sandbox/test-events", anon: 401, allowRoles: ["admin", "owner"] },
  { method: "GET", path: "/v1/console/sandbox/sample-feed", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
  { method: "GET", path: "/v1/console/sandbox/sample-bundle", anon: 401, allowRoles: ["viewer", "auditor", "approver", "engineer", "admin", "owner"] },
];

export const AEGIS_ROUTE_RULES: RouteRule[] = [
  { method: "POST", path: "/v1/aegis/governed/events", anon: 401, allowRoles: ["ingest"] },
  { method: "POST", path: "/v1/aegis/bank/events", anon: 401, allowRoles: ["ingest"] },
  { method: "POST", path: "/v1/aegis/approvals/request", anon: 401, allowRoles: ["ingest"] },
  { method: "POST", path: "/v1/aegis/bank/events/batch", anon: 401, allowRoles: ["ingest"] },
  { method: "POST", path: "/v1/aegis/source-events", anon: 401, allowRoles: ["ingest"] },
  { method: "GET", path: "/v1/aegis/sources/:sourceId/last-seq", anon: 401, allowRoles: ["ingest"] },
  { method: "POST", path: "/v1/aegis/reconciliation/feeds/:feedId/ingest", anon: 401, allowRoles: ["ingest"] },
];

export const ALL_ROUTE_RULES = [...CONSOLE_ROUTE_RULES, ...AEGIS_ROUTE_RULES];

/** Paths that must appear in the matrix (deny-by-default inventory). */
export const REQUIRED_ROUTE_PATTERNS = ALL_ROUTE_RULES.map(
  (r) => `${r.method} ${r.path}`,
);
