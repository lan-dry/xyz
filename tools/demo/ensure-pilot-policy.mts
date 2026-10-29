/**
 * Ensure your pilot org denies retail consumer refunds above USD 200.
 * Org: CLI arg, valid AEGIS_ORGANIZATION_ID, or Northwind from DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { getDemoTargets } from "./demo-targets.mts";
import { loadEnvFile } from "./load-env.mts";
import { resolveOrganizationSlug } from "./resolve-org-id.mts";

loadEnvFile();

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("DATABASE_URL missing — set it in repo root .env (Postgres for local dev)");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: normalizePostgresDatabaseUrl(dbUrl),
});

async function resolvePilotOrgId(): Promise<string> {
  const fromArg = process.argv[2]?.trim();
  const fromEnv = process.env.AEGIS_ORGANIZATION_ID?.trim();
  for (const candidate of [fromArg, fromEnv]) {
    if (!candidate) continue;
    const orgCheck = await pool.query(
      `SELECT 1 FROM organization WHERE organization_id = $1`,
      [candidate],
    );
    if (orgCheck.rows[0]) return candidate;
    console.warn(`Ignoring unknown organization_id ${candidate} (not in database)`);
  }
  const targets = await getDemoTargets();
  return targets.organizationId;
}

try {
  const orgId = await resolvePilotOrgId();
  const slug = await resolveOrganizationSlug(orgId);

  await pool.query(
    `DELETE FROM policy_rule pr
     USING policy p
     WHERE pr.policy_id = p.policy_id
       AND p.organization_id = $1
       AND pr.tool_pattern = 'stripe.paymentIntents.create'`,
    [orgId],
  );

  const slugPart = slug.replace(/[^a-z0-9-]/g, "-").slice(0, 24);
  const policyId = `pol_${slugPart}_${orgId.replace(/-/g, "").slice(0, 8)}`;
  const ruleId = `rule_deny_retail_refund_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  await pool.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($1, $2, 'Retail refund controls', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET
       name = EXCLUDED.name,
       status = 'active',
       activated_at = now()`,
    [policyId, orgId],
  );
  await pool.query(
    `INSERT INTO policy_rule (
       rule_id, policy_id, tool_pattern, decision, priority, conditions
     ) VALUES (
       $1, $2, 'stripe.paymentIntents.create', 'deny', 200,
       '{"rule_type":"max_per_tx","max_amount_usd":200,"when":{"segment":"retail","account_type":"consumer"}}'::jsonb
     )`,
    [ruleId, policyId],
  );

  const agent = await pool.query(
    `SELECT agent_id FROM agent WHERE organization_id = $1 AND active = true ORDER BY created_at LIMIT 1`,
    [orgId],
  );
  if (agent.rows[0]?.agent_id) {
    await pool.query(`UPDATE agent SET default_policy_id = $2 WHERE agent_id = $1`, [
      agent.rows[0].agent_id,
      policyId,
    ]);
  }

  console.log(`OK  Added contextual retail-refund policy ${policyId} for org ${slug} (${orgId})`);
  console.log("    Retail consumer refunds above USD 200 are denied; other contexts are allowed.");
  console.log("    Run: pnpm pilot:agent");
} finally {
  await pool.end();
}
