/**
 * One-shot demo cleanup: fix KYC when clause, archive empty policies, expire stale pending approvals.
 */
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { getDemoTargets } from "./demo-targets.mts";
import { loadEnvFile } from "./load-env.mts";

loadEnvFile();

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("Need DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: normalizePostgresDatabaseUrl(dbUrl),
});

try {
  const { organizationId: orgId } = await getDemoTargets();

  const kyc = await pool.query(
    `UPDATE policy_rule
     SET conditions = '{"rule_type":"tool","when":{"risk_tier":"high"}}'::jsonb,
         decision = 'allow_with_obligation',
         priority = 100,
         tool_pattern = 'kyc.merchant.approve'
     WHERE rule_id = 'rule_kyc_high_risk_hold'
     RETURNING rule_id, conditions`,
  );
  console.log("KYC rule:", JSON.stringify(kyc.rows[0] ?? "missing"));

  const empty = await pool.query(
    `UPDATE policy p
     SET status = 'archived', activated_at = NULL
     WHERE p.organization_id = $1
       AND p.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM policy_rule pr WHERE pr.policy_id = p.policy_id)
     RETURNING policy_id, name`,
    [orgId],
  );
  console.log("Archived empty:", empty.rows);

  const active = await pool.query(
    `SELECT p.policy_id, p.name, COUNT(pr.rule_id)::int AS rules
     FROM policy p
     LEFT JOIN policy_rule pr ON pr.policy_id = p.policy_id
     WHERE p.organization_id = $1 AND p.status = 'active'
     GROUP BY p.policy_id, p.name
     ORDER BY p.name`,
    [orgId],
  );
  console.log("Active policies:");
  for (const r of active.rows) {
    console.log(`  ${r.policy_id} | ${r.name} | rules=${r.rules}`);
  }

  const expired = await pool.query(
    `UPDATE approval a
     SET status = 'expired', decided_at = now()
     FROM event e
     WHERE a.event_id = e.event_id
       AND a.organization_id = $1
       AND a.status IN ('pending', 'needs_info')
     RETURNING a.approval_id, e.trace_id`,
    [orgId],
  );
  for (const row of expired.rows) {
    if (row.trace_id) {
      await pool.query(
        `UPDATE trace SET status = 'failed', ended_at = now()
         WHERE trace_id = $1 AND organization_id = $2 AND status = 'blocked'`,
        [row.trace_id, orgId],
      );
    }
  }
  console.log("Expired pending approvals:", expired.rowCount ?? 0);
} finally {
  await pool.end();
}
