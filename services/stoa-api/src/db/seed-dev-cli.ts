import "./load-env.js";
import { getPool, closePool } from "./pool.js";

const slug = process.env.STOA_DEV_TENANT_SLUG ?? "local";
const name = process.env.STOA_DEV_TENANT_NAME ?? "Local dev";

const pool = getPool();
const existing = await pool.query<{ id: string }>(
  `SELECT id FROM stoa_tenant WHERE slug = $1`,
  [slug],
);
if (existing.rows[0]) {
  console.log(`Dev tenant "${slug}" already exists (${existing.rows[0].id})`);
} else {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO stoa_tenant (slug, name) VALUES ($1, $2) RETURNING id`,
    [slug, name],
  );
  console.log(`Created dev tenant "${slug}" (${inserted.rows[0]?.id})`);
}
await closePool();
