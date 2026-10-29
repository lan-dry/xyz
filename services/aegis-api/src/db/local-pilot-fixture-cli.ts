/**
 * Local only: create a clean prospect organization and attach pilot agent / ingest / policy.
 * Run after `pnpm db:migrate` and `pnpm db:seed:bootstrap`.
 */
import "./load-env.js";
import { assertLocalDatabaseUrl } from "./local-db-guard.js";
import {
  applyPilotDemoData,
  DEFAULT_PILOT_ORG_NAME,
  DEFAULT_PILOT_ORG_SLUG,
  PILOT_AGENT_ID,
  PILOT_KYC_AGENT_ID,
  PILOT_PAYOUT_AGENT_ID,
} from "./pilot-demo-data.js";
import { closePool, getPool } from "./pool.js";

const PILOT_SLUG = process.env.PILOT_ORGANIZATION_SLUG?.trim() || DEFAULT_PILOT_ORG_SLUG;
const PILOT_NAME = process.env.PILOT_ORGANIZATION_NAME?.trim() || DEFAULT_PILOT_ORG_NAME;
const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null;

assertLocalDatabaseUrl();

const client = await getPool().connect();
try {
  await client.query("BEGIN");
  const org = await client.query<{ organization_id: string }>(
    `INSERT INTO organization (name, slug, onboarding_completed_at, active)
     VALUES ($1, $2, now(), true)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       active = true,
       onboarding_completed_at = COALESCE(organization.onboarding_completed_at, now()),
       updated_at = now()
     RETURNING organization_id`,
    [PILOT_NAME, PILOT_SLUG],
  );
  const organizationId = org.rows[0]?.organization_id;
  if (!organizationId) {
    throw new Error(`Could not create pilot organization ${PILOT_SLUG}`);
  }

  const account = await client.query<{ account_id: string; email: string }>(
    `SELECT account_id, email
     FROM account
     WHERE active = true
       AND ($1::text IS NULL OR lower(email) = $1)
     ORDER BY CASE WHEN platform_role IS NOT NULL THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
    [bootstrapEmail],
  );
  const pilotAdmin = account.rows[0];
  if (!pilotAdmin) {
    throw new Error(
      "No active account found for the pilot organization. Run pnpm db:seed:bootstrap first.",
    );
  }

  await client.query(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (organization_id, account_id) DO UPDATE SET role = 'admin', status = 'active'`,
    [pilotAdmin.account_id, organizationId],
  );

  await applyPilotDemoData(client, organizationId, PILOT_SLUG);
  await client.query("COMMIT");

  console.log(`Local pilot fixture applied on ${PILOT_NAME} (${PILOT_SLUG}):`);
  console.log(`  admin: ${pilotAdmin.email}`);
  console.log(`  agents: ${PILOT_AGENT_ID}, ${PILOT_PAYOUT_AGENT_ID}, ${PILOT_KYC_AGENT_ID}`);
  console.log("  refund policy: retail consumer refunds above USD 200 are denied");
  console.log(
    "  payout policy: payouts above USD 1,000 to merchants younger than 30 days require approval",
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  client.release();
  await closePool();
}
