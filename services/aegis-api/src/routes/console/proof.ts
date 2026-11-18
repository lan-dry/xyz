import { Hono } from "hono";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { getPool } from "../../db/pool.js";
import { simulatePolicyOnHistory } from "../../repo/policy-simulate.js";
import { ensureDefaultScoreBands } from "../../repo/score-bands.js";
import {
  buildRiskApprovalPack,
  renderRiskApprovalPdf,
} from "../../compliance/risk-approval-pack.js";
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
        { error: "Score bands are not available in this database yet.", bands: [] },
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
  const pack = await buildRiskApprovalPack(getPool(), orgId);
  const accept = (c.req.header("accept") ?? "").toLowerCase();
  const asZip =
    c.req.query("format") === "zip" ||
    accept.includes("application/zip") ||
    accept.includes("application/octet-stream");

  if (!asZip) {
    return c.json({ pack });
  }

  const pdf = renderRiskApprovalPdf(pack);
  const jsonBytes = Buffer.from(JSON.stringify(pack, null, 2), "utf8");
  const day = pack.generated_at.slice(0, 10);
  const filename = `risk-approval-pack-${day}.zip`;

  const archive = archiver("zip", { zlib: { level: 9 } });
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    pass.on("end", () => resolve(Buffer.concat(chunks)));
    pass.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(pass);
  archive.append(pdf, { name: "risk-approval-pack.pdf" });
  archive.append(jsonBytes, { name: "pack.json" });
  await archive.finalize();
  const zip = await done;

  return new Response(zip, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zip.length),
    },
  });
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
