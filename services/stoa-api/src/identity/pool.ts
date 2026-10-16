import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Org accounts, sessions, SCIM — same Postgres as private deploy identity (not Salanor SaaS). */
export function getIdentityPool(): pg.Pool {
  if (!pool) {
    const url =
      process.env.STOA_IDENTITY_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim();
    if (!url) {
      throw new Error(
        "STOA_IDENTITY_DATABASE_URL or DATABASE_URL required for workspace auth",
      );
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export function identityConfigured(): boolean {
  return Boolean(
    process.env.STOA_IDENTITY_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim(),
  );
}
