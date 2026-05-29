/**
 * Ensure pilot org has active deny rule for stripe.paymentIntents.create.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadPilotAgentEnv } from "./load-env.mts";

loadPilotAgentEnv();

const orgId =
  process.argv[2]?.trim() || process.env.PILOT_ORGANIZATION_ID?.trim();
const dbUrl = process.env.DATABASE_URL?.trim();

if (!dbUrl) {
  console.error(
    "DATABASE_URL missing — set it in repo root .env (see .env.example)",
  );
  process.exit(1);
}
if (!orgId) {
  console.error(
    "Pass organization_id or set PILOT_ORGANIZATION_ID in apps/pilot-agent/.env",
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });
try {
  const org = await pool.query(`SELECT slug FROM organization WHERE organization_id = $1`, [
    orgId,
  ]);
  const slug = org.rows[0]?.slug;
  if (!slug) {
    console.error(`Organization not found: ${orgId}`);
    process.exit(1);
  }

  const existing = await pool.query(
    `SELECT pr.rule_id
     FROM policy p
     JOIN policy_rule pr ON pr.policy_id = p.policy_id
     WHERE p.organization_id = $1
       AND p.status = 'active'
       AND pr.tool_pattern = 'stripe.paymentIntents.create'
       AND pr.decision = 'deny'`,
    [orgId],
  );
  if (existing.rows.length > 0) {
    console.log(`OK  Org ${slug} already has active deny rule for stripe.paymentIntents.create`);
    process.exit(0);
  }

  const slugPart = slug.replace(/[^a-z0-9-]/g, "-").slice(0, 24);
  const policyId = `pol_${slugPart}_${orgId.replace(/-/g, "").slice(0, 8)}`;
  const ruleId = `rule_deny_stripe_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  await pool.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($1, $2, 'Default', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET status = 'active', activated_at = now()`,
    [policyId, orgId],
  );
  await pool.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority)
     VALUES ($1, $2, 'stripe.paymentIntents.create', 'deny', 100)`,
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

  console.log(`OK  Added deny policy ${policyId} for org ${slug} (${orgId})`);
  console.log("    Run: pnpm pilot:agent");
} finally {
  await pool.end();
}
