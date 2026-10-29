import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";

const pool = getPool();
const a = await pool.query(
  `SELECT account_id, email, active,
          (password_hash IS NOT NULL) AS has_pw,
          (email_verified_at IS NOT NULL) AS verified
   FROM account WHERE lower(email) = lower($1)`,
  ["landry@salanor.com"],
);
const m = await pool.query(
  `SELECT m.role, m.status, o.slug, o.name
   FROM membership m
   JOIN organization o ON o.organization_id = m.organization_id
   JOIN account a ON a.account_id = m.account_id
   WHERE lower(a.email) = lower($1)`,
  ["landry@salanor.com"],
);
const cnt = await pool.query(
  `SELECT
     (SELECT count(*)::int FROM account) AS accounts,
     (SELECT count(*)::int FROM organization) AS orgs,
     (SELECT count(*)::int FROM schema_migration) AS migrations`,
);
console.log(
  JSON.stringify({ account: a.rows, memberships: m.rows, counts: cnt.rows[0] }, null, 2),
);
await closePool();
