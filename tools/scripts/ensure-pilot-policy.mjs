/**
 * Ensure pilot org has active deny rule for stripe.paymentIntents.create.
 * Usage: node tools/scripts/ensure-pilot-policy.mjs [organization_id]
 * Loads DATABASE_URL from repo root .env; if no arg, reads PILOT_ORGANIZATION_ID from apps/pilot-agent/.env
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv(path) {
  if (!existsSync(path)) return;
  let text = readFileSync(path, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(resolve(root, ".env.local"));
loadEnv(resolve(root, ".env"));
loadEnv(resolve(root, "apps/pilot-agent/.env"));

const orgId =
  process.argv[2]?.trim() || process.env.PILOT_ORGANIZATION_ID?.trim();
const dbUrl = process.env.DATABASE_URL?.trim();

if (!dbUrl) {
  console.error("DATABASE_URL missing in repo .env");
  process.exit(1);
}
if (!orgId) {
  console.error("Pass organization_id or set PILOT_ORGANIZATION_ID in apps/pilot-agent/.env");
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
    `SELECT pr.rule_id, pr.decision, p.status
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
