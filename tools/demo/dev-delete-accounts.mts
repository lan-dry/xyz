#!/usr/bin/env tsx
/**
 * Dev-only: delete test accounts by email.
 * Usage: pnpm dev:delete-accounts -- --purge-orgs email@example.com
 */
import pg from "pg";
import { loadPilotAgentEnv } from "./load-env.mts";

loadPilotAgentEnv();

const args = process.argv.slice(2);
const purgeOrgs = args.includes("--purge-orgs");
const emails = args.filter((a) => !a.startsWith("--")).map((e) => e.trim().toLowerCase());

if (emails.length === 0) {
  console.error("Usage: pnpm dev:delete-accounts -- [--purge-orgs] email [email...]");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("DATABASE_URL missing in .env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });

try {
  for (const email of emails) {
    const row = await pool.query(
      `SELECT account_id FROM account WHERE lower(email) = $1`,
      [email],
    );
    const accountId = row.rows[0]?.account_id as string | undefined;
    if (!accountId) {
      console.log(`Skip  ${email} — not found`);
      continue;
    }

    if (purgeOrgs) {
      const orgs = await pool.query<{ organization_id: string; slug: string }>(
        `SELECT DISTINCT o.organization_id, o.slug
         FROM membership m
         JOIN organization o ON o.organization_id = m.organization_id
         WHERE m.account_id = $1 AND m.role = 'admin'`,
        [accountId],
      );
      for (const org of orgs.rows) {
        const others = await pool.query(
          `SELECT 1 FROM membership
           WHERE organization_id = $1 AND account_id <> $2 AND status = 'active'
           LIMIT 1`,
          [org.organization_id, accountId],
        );
        if (!others.rows[0]) {
          await pool.query(`DELETE FROM organization WHERE organization_id = $1`, [
            org.organization_id,
          ]);
          console.log(`  Purged org ${org.slug}`);
        }
      }
    }

    await pool.query(`DELETE FROM account WHERE account_id = $1`, [accountId]);
    console.log(`OK    Deleted ${email}`);
  }
} finally {
  await pool.end();
}
