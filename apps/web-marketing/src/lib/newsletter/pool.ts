import { normalizePostgresDatabaseUrl } from "@salanor/db-url";
import pg from "pg";

export function getNewsletterPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  return new pg.Pool({ connectionString: normalizePostgresDatabaseUrl(url), max: 2 });
}
