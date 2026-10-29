/**
 * Phase 2 tier demo: Standard / Gold / Business segment table + hard ceiling.
 * Reuses fixed policy id pol-contextual-refunds (does not orphan empty policies).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { getDemoTargets } from "./demo-targets.mts";
import { loadEnvFile } from "./load-env.mts";
import { resolveOrganizationSlug } from "./resolve-org-id.mts";

loadEnvFile();

const PILOT_POLICY_ID = "pol-contextual-refunds";

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("Need DATABASE_URL in repo .env");
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

  // Only remove amount/tier rules on the fixed refund policy — never wipe beneficiary_match.
  await pool.query(
    `DELETE FROM policy_rule
     WHERE policy_id = $1
       AND tool_pattern = 'stripe.paymentIntents.create'
       AND coalesce(conditions->>'rule_type', '') <> 'beneficiary_match'`,
    [PILOT_POLICY_ID],
  );

  // Archive slug-based duplicate refund policies from older ensure runs.
  await pool.query(
    `UPDATE policy
     SET status = 'archived', activated_at = NULL
     WHERE organization_id = $1
       AND policy_id <> $2
       AND name ILIKE '%tier refund%'
       AND status = 'active'`,
    [orgId, PILOT_POLICY_ID],
  );

  const tierRuleId = `rule_tier_stripe_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const ceilingRuleId = `rule_ceiling_stripe_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  await pool.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($1, $2, 'Tier refund controls (Standard / Gold / Business)', 2, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET
       name = EXCLUDED.name,
       version = GREATEST(policy.version, EXCLUDED.version),
       status = 'active',
       activated_at = now()`,
    [PILOT_POLICY_ID, orgId],
  );

  await pool.query(
    `INSERT INTO policy_rule (
       rule_id, policy_id, tool_pattern, decision, priority, conditions
     ) VALUES (
       $1, $2, 'stripe.paymentIntents.create', 'deny', 900,
       $3::jsonb
     )`,
    [
      ceilingRuleId,
      PILOT_POLICY_ID,
      JSON.stringify({
        rule_type: "max_per_tx",
        layer: "ceiling",
        limit_source: "fixed",
        max_amount_usd: 5000,
        on_lookup_fail: "deny",
      }),
    ],
  );

  await pool.query(
    `INSERT INTO policy_rule (
       rule_id, policy_id, tool_pattern, decision, priority, conditions
     ) VALUES (
       $1, $2, 'stripe.paymentIntents.create', 'allow_with_obligation', 200,
       $3::jsonb
     )`,
    [
      tierRuleId,
      PILOT_POLICY_ID,
      JSON.stringify({
        rule_type: "max_per_tx",
        layer: "contextual",
        limit_source: "segment_table",
        segment_limits: {
          standard: 200,
          gold: 1000,
          business: 5000,
        },
        on_lookup_fail: "allow_with_obligation",
        when: { account_type: "consumer" },
      }),
    ],
  );

  // Archive any active policy with zero rules (leftovers from prior buggy ensures).
  await pool.query(
    `UPDATE policy p
     SET status = 'archived', activated_at = NULL
     WHERE p.organization_id = $1
       AND p.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM policy_rule pr WHERE pr.policy_id = p.policy_id
       )`,
    [orgId],
  );

  console.log(`OK  Org ${slug}: tier refund limits (Standard $200 / Gold $1,000 / Business $5,000)`);
  console.log(`    Policy: ${PILOT_POLICY_ID}`);
  console.log("    Hard ceiling: Stop above USD 5,000");
  console.log("    $249 Standard → Ask a person; $249 Gold → Allow");
  console.log("    Run: pnpm pilot:agent:approval");
  console.log("         pnpm pilot:agent:approval:gold");
  console.log("    Then open Console → Approvals to approve or decline");
} finally {
  await pool.end();
}
