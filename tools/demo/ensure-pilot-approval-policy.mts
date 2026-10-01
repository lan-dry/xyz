/**
 * Human-in-the-loop demo: require approval for stripe.paymentIntents.create (priority 200).
 * Removes deny rules on the same tool so approval wins. Org: AEGIS_ORGANIZATION_ID in .env.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { loadEnvFile } from "./load-env.mts";
import { resolveOrganizationSlug } from "./resolve-org-id.mts";

loadEnvFile();

const dbUrl = process.env.DATABASE_URL?.trim();
const orgId = process.argv[2]?.trim() || process.env.AEGIS_ORGANIZATION_ID?.trim();

if (!dbUrl || !orgId) {
  console.error("Need DATABASE_URL and AEGIS_ORGANIZATION_ID in repo .env");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: normalizePostgresDatabaseUrl(dbUrl),
});
try {
  const slug = await resolveOrganizationSlug(orgId);

  await pool.query(
    `DELETE FROM policy_rule pr
     USING policy p
     WHERE pr.policy_id = p.policy_id
       AND p.organization_id = $1
       AND pr.tool_pattern = 'stripe.paymentIntents.create'
       AND pr.decision = 'deny'`,
    [orgId],
  );

  const existing = await pool.query(
    `SELECT pr.rule_id
     FROM policy p
     JOIN policy_rule pr ON pr.policy_id = p.policy_id
     WHERE p.organization_id = $1
       AND p.status = 'active'
       AND pr.tool_pattern = 'stripe.paymentIntents.create'
       AND pr.decision = 'allow_with_obligation'
       AND pr.priority >= 200`,
    [orgId],
  );
  if (existing.rows.length > 0) {
    console.log(`OK  Org ${slug} already has require-approval rule for stripe.paymentIntents.create`);
    console.log("    Run: pnpm pilot:agent:approval");
    process.exit(0);
  }

  const slugPart = slug.replace(/[^a-z0-9-]/g, "-").slice(0, 24);
  const policyId = `pol_${slugPart}_${orgId.replace(/-/g, "").slice(0, 8)}`;
  const ruleId = `rule_approve_stripe_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  await pool.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($1, $2, 'Default', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET status = 'active', activated_at = now()`,
    [policyId, orgId],
  );
  await pool.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority)
     VALUES ($1, $2, 'stripe.paymentIntents.create', 'allow_with_obligation', 200)`,
    [ruleId, policyId],
  );

  console.log(`OK  Org ${slug}: payment tool now requires human approval (deny rules cleared)`);
  console.log("    Run: pnpm pilot:agent:approval");
  console.log("    Then open Console → Approvals to approve or reject");
} finally {
  await pool.end();
}
