#!/usr/bin/env node
/**
 * Dev-only: delete test accounts by email (cascade via FK).
 * Does NOT delete organizations — orphan orgs may remain; pass --purge-orgs to remove orgs
 * where the account was the only admin.
 *
 * Usage:
 *   node tools/scripts/dev-delete-accounts.mjs joeydry@tutanota.com ismaelmora@proton.me
 *   node tools/scripts/dev-delete-accounts.mjs --purge-orgs joeydry@tutanota.com
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

function loadEnv() {
  for (const f of [".env", "apps/pilot-agent/.env"]) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

loadEnv();

const args = process.argv.slice(2);
const purgeOrgs = args.includes("--purge-orgs");
const emails = args.filter((a) => !a.startsWith("--")).map((e) => e.trim().toLowerCase());

if (emails.length === 0) {
  console.error("Usage: node tools/scripts/dev-delete-accounts.mjs [--purge-orgs] email [email...]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Start Postgres and configure .env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  for (const email of emails) {
    const row = await pool.query(
      `SELECT account_id, email FROM account WHERE lower(email) = $1`,
      [email],
    );
    const accountId = row.rows[0]?.account_id;
    if (!accountId) {
      console.log(`Skip  ${email} — not found`);
      continue;
    }

    if (purgeOrgs) {
      const orgs = await pool.query(
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
          console.log(`  Purged org ${org.slug} (${org.organization_id})`);
        }
      }
    }

    await pool.query(`DELETE FROM account WHERE account_id = $1`, [accountId]);
    console.log(`OK    Deleted account ${email} (${accountId})`);
  }
} finally {
  await pool.end();
}
