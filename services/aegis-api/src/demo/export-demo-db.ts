/**
 * Pin export CLI to local demo Postgres + banking demo org.
 * Call after load-env so .env :5432 / Neon cannot win.
 */
export function applyExportDemoDb(): {
  databaseUrl: string;
  organizationId: string;
} {
  const databaseUrl =
    process.env.AEGIS_EXPORT_DATABASE_URL?.trim() ||
    process.env.DEMO_DATABASE_URL?.trim() ||
    "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
  const organizationId =
    process.env.AEGIS_ORGANIZATION_ID?.trim() ||
    process.env.AEGIS_ORG_ID?.trim() ||
    "cf2acb42-e697-47c5-ac42-d68487f01bae";
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL_UNPOOLED = databaseUrl;
  process.env.AEGIS_ORGANIZATION_ID = organizationId;
  return { databaseUrl, organizationId };
}
