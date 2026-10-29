/**
 * Claude §13.1 — Stop when refund destination ≠ customer on file.
 * Reuses fixed policy id pol-beneficiary-match (no duplicate empty policies).
 */
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { getDemoTargets } from "./demo-targets.mts";
import { loadEnvFile } from "./load-env.mts";
import { resolveOrganizationSlug } from "./resolve-org-id.mts";

loadEnvFile();

const PILOT_BENMATCH_POLICY_ID = "pol-beneficiary-match";
const RULE_ID = "rule_beneficiary_match_refund";

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("Need DATABASE_URL in repo .env");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: normalizePostgresDatabaseUrl(dbUrl),
});

try {
  const targets = await getDemoTargets();
  const orgId = targets.organizationId;
  const slug = await resolveOrganizationSlug(orgId);

  // Archive duplicate beneficiary policies from older slug-based ensure runs.
  await pool.query(
    `UPDATE policy
     SET status = 'archived', activated_at = NULL
     WHERE organization_id = $1
       AND policy_id <> $2
       AND (
         name ILIKE '%beneficiary match%'
         OR policy_id LIKE 'pol_benmatch_%'
       )
       AND status = 'active'`,
    [orgId, PILOT_BENMATCH_POLICY_ID],
  );

  await pool.query(
    `DELETE FROM policy_rule pr
     USING policy p
     WHERE pr.policy_id = p.policy_id
       AND p.organization_id = $1
       AND pr.conditions->>'rule_type' = 'beneficiary_match'
       AND pr.policy_id <> $2`,
    [orgId, PILOT_BENMATCH_POLICY_ID],
  );

  await pool.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($1, $2, 'Beneficiary match (manipulated-agent stop)', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET
       name = EXCLUDED.name,
       version = GREATEST(policy.version, EXCLUDED.version),
       status = 'active',
       activated_at = now()`,
    [PILOT_BENMATCH_POLICY_ID, orgId],
  );

  await pool.query(
    `INSERT INTO policy_rule (
       rule_id, policy_id, tool_pattern, decision, priority, conditions
     ) VALUES (
       $1, $2, 'stripe.paymentIntents.create', 'deny', 950,
       $3::jsonb
     )
     ON CONFLICT (rule_id) DO UPDATE SET
       policy_id = EXCLUDED.policy_id,
       tool_pattern = EXCLUDED.tool_pattern,
       decision = EXCLUDED.decision,
       priority = EXCLUDED.priority,
       conditions = EXCLUDED.conditions`,
    [
      RULE_ID,
      PILOT_BENMATCH_POLICY_ID,
      JSON.stringify({
        rule_type: "beneficiary_match",
        layer: "ceiling",
        on_lookup_fail: "deny",
      }),
    ],
  );

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

  console.log(`OK  Org ${slug}: beneficiary_match Stop when destination ≠ customer on file`);
  console.log(`    Policy: ${PILOT_BENMATCH_POLICY_ID}`);
  console.log("    Run: pnpm pilot:agent:manipulated");
  console.log(
    '    Case headline: "Stopped: refund destination does not match the customer on record."',
  );
} finally {
  await pool.end();
}
