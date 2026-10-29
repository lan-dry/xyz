import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import { simulatePolicyOnHistory } from "../../repo/policy-simulate.js";
import {
  ensureDefaultScoreBands,
  listScoreBands,
} from "../../repo/score-bands.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const proofRoutes = new Hono<{ Variables: ConsoleVariables }>();

proofRoutes.get("/score-bands", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const envRaw = c.req.query("environment")?.trim();
  const environment = envRaw === "sandbox" ? "sandbox" : "production";
  const pool = getPool();
  try {
    const bands = await ensureDefaultScoreBands(pool, orgId, environment);
    return c.json({ bands });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("score_band") || message.includes("does not exist")) {
      return c.json(
        { error: "Score bands require migration 009. Run: pnpm db:migrate", bands: [] },
        503,
      );
    }
    throw error;
  }
});

proofRoutes.get("/policy/simulate", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const daysRaw = Number(c.req.query("days") ?? "90");
  const days: 30 | 90 = daysRaw <= 30 ? 30 : 90;
  const report = await simulatePolicyOnHistory(getPool(), orgId, days);
  return c.json({ report });
});

proofRoutes.get("/risk-approval-pack", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const pool = getPool();
  const org = await pool.query<{ name: string; slug: string }>(
    `SELECT name, slug FROM organization WHERE organization_id = $1`,
    [orgId],
  );
  const policies = await pool.query<{
    policy_id: string;
    name: string;
    version: number;
    status: string;
  }>(
    `SELECT policy_id, name, version, status FROM policy
     WHERE organization_id = $1 AND status = 'active'
     ORDER BY activated_at DESC NULLS LAST LIMIT 10`,
    [orgId],
  );
  const bands = await listScoreBands(pool, orgId, "production").catch(() => []);
  const receipts = await pool.query<{
    event_id: string;
    trace_id: string;
    tool_name: string | null;
    policy_decision: string;
    emitted_at: Date;
  }>(
    `SELECT event_id, trace_id, tool_name, policy_decision, emitted_at
     FROM event
     WHERE organization_id = $1
     ORDER BY emitted_at DESC
     LIMIT 5`,
    [orgId],
  );
  const pending = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM approval
     WHERE organization_id = $1 AND status = 'pending'`,
    [orgId],
  );

  const pack = {
    pack_type: "risk_approval_pack",
    generated_at: new Date().toISOString(),
    organization: {
      organization_id: orgId,
      name: org.rows[0]?.name ?? null,
      slug: org.rows[0]?.slug ?? null,
    },
    pilot_limits: {
      pending_approvals: Number(pending.rows[0]?.count ?? 0),
      score_bands: bands,
      note: "Customer models detect risk; Aegis enforces bands and seals the trail.",
    },
    active_policies: policies.rows,
    sample_receipts: receipts.rows.map((r) => ({
      event_id: r.event_id,
      trace_id: r.trace_id,
      tool_name: r.tool_name,
      policy_decision: r.policy_decision,
      emitted_at: r.emitted_at.toISOString(),
    })),
    sign_off: {
      statement:
        "Risk committee acknowledges sealed APS-1 receipts, active policy versions, and score bands above for this pilot.",
      fields: ["name", "role", "date", "signature"],
    },
  };

  return c.json({ pack });
});

proofRoutes.get("/rule-preview", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const pool = getPool();
  const rules = await pool.query<{
    rule_id: string;
    policy_id: string;
    tool_pattern: string;
    decision: string;
    policy_name: string;
  }>(
    `SELECT pr.rule_id, pr.policy_id, pr.tool_pattern, pr.decision, p.name AS policy_name
     FROM policy_rule pr
     JOIN policy p ON p.policy_id = pr.policy_id
     WHERE p.organization_id = $1 AND p.status IN ('active', 'draft')
     ORDER BY p.activated_at DESC NULLS LAST
     LIMIT 50`,
    [orgId],
  );

  const previews = [];
  for (const rule of rules.rows) {
    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM event
       WHERE organization_id = $1
         AND emitted_at >= now() - interval '30 days'
         AND tool_name IS NOT NULL
         AND (
           tool_name = $2
           OR tool_name LIKE replace($2, '*', '%')
         )`,
      [orgId, rule.tool_pattern],
    );
    previews.push({
      ...rule,
      match_count_30d: Number(count.rows[0]?.count ?? 0),
    });
  }
  return c.json({ previews });
});

proofRoutes.get("/tuning-suggestions", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const pool = getPool();
  const stats = await pool.query<{
    tool_name: string;
    total: string;
    approved: string;
    avg_hours: string | null;
  }>(
    `SELECT e.tool_name,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE a.status = 'approved')::text AS approved,
            AVG(EXTRACT(EPOCH FROM (a.decided_at - a.created_at)) / 3600.0)::text AS avg_hours
     FROM approval a
     JOIN event e ON e.event_id = a.event_id
     WHERE a.organization_id = $1
       AND a.created_at >= now() - interval '90 days'
       AND e.tool_name IS NOT NULL
     GROUP BY e.tool_name
     HAVING COUNT(*) >= 3
     ORDER BY COUNT(*) DESC
     LIMIT 10`,
    [orgId],
  );

  const suggestions = stats.rows.map((row) => {
    const total = Number(row.total);
    const approved = Number(row.approved);
    const rate = total > 0 ? approved / total : 0;
    const avgHours = row.avg_hours != null ? Number(row.avg_hours) : null;
    return {
      tool_name: row.tool_name,
      approval_count: total,
      approve_rate: Math.round(rate * 1000) / 10,
      avg_decision_hours: avgHours != null ? Math.round(avgHours * 10) / 10 : null,
      suggestion:
        rate >= 0.9
          ? `Consider raising auto-allow threshold for ${row.tool_name} (approve rate ${Math.round(rate * 100)}%). Apply requires a named approver and a new policy version.`
          : rate <= 0.4
            ? `Consider tightening rules for ${row.tool_name} (approve rate ${Math.round(rate * 100)}%). Apply requires a named approver and a new policy version.`
            : `Monitor ${row.tool_name}; no automatic change recommended.`,
      apply_requires: ["named_approver", "new_policy_version"],
    };
  });

  return c.json({
    suggestions,
    note: "Suggestions only. Aegis never auto-changes live rules.",
  });
});
