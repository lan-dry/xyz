/**
 * Production bootstrap: one Platform Ops superadmin + internal "Salanor" org.
 * No dev agents, policies, ingest keys, or @salanor.local accounts.
 *
 * Usage (DATABASE_URL = Neon direct/unpooled from your machine):
 *   BOOTSTRAP_ADMIN_EMAIL=you@salanor.com BOOTSTRAP_ADMIN_PASSWORD='...' pnpm db:seed:bootstrap
 */
import "./load-env.js";
import { hashPassword } from "@salanor/platform-auth";
import { closePool, getPool } from "./pool.js";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
const orgName = process.env.BOOTSTRAP_ORG_NAME?.trim() || "Salanor";
const orgSlug = process.env.BOOTSTRAP_ORG_SLUG?.trim().toLowerCase() || "salanor";
const displayName =
  process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || email?.split("@")[0] || "Admin";

if (!email || !password) {
  console.error(
    "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, then re-run pnpm db:seed:bootstrap",
  );
  process.exit(1);
}

if (password.length < 10) {
  console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters.");
  process.exit(1);
}

const client = await getPool().connect();

try {
  await client.query("BEGIN");

  const orgRow = await client.query<{ organization_id: string }>(
    `INSERT INTO organization (name, slug, onboarding_completed_at)
     VALUES ($1, $2, now())
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       onboarding_completed_at = COALESCE(organization.onboarding_completed_at, now())
     RETURNING organization_id`,
    [orgName, orgSlug],
  );
  const organizationId = orgRow.rows[0]!.organization_id;

  const passwordHash = hashPassword(password);

  const existing = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account WHERE lower(email) = $1`,
    [email],
  );

  let accountId: string;
  if (existing.rows[0]) {
    accountId = existing.rows[0].account_id;
    await client.query(
      `UPDATE account SET
         display_name = $2,
         password_hash = $3,
         platform_role = 'superadmin',
         email_verified_at = COALESCE(email_verified_at, now()),
         active = true,
         updated_at = now()
       WHERE account_id = $1`,
      [accountId, displayName, passwordHash],
    );
  } else {
    const inserted = await client.query<{ account_id: string }>(
      `INSERT INTO account (email, display_name, password_hash, platform_role, email_verified_at, active)
       VALUES ($1, $2, $3, 'superadmin', now(), true)
       RETURNING account_id`,
      [email, displayName, passwordHash],
    );
    accountId = inserted.rows[0]!.account_id;
  }

  await client.query(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (organization_id, account_id) DO UPDATE SET
       role = 'admin',
       status = 'active'`,
    [accountId, organizationId],
  );

  await client.query("COMMIT");

  console.log("Bootstrap complete:");
  console.log(`  organization: ${orgName} (${orgSlug})`);
  console.log(`  superadmin:   ${email}`);
  console.log("  Platform Ops: sign in at ops.salanor.com (or :3003 locally)");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  client.release();
  await closePool();
}
