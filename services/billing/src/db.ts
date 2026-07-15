import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not configured");
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: databaseUrl });
  }
  return pool;
}
