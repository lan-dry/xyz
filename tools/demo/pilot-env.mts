/** Integration-test org id — not used for local pilot; ignore if still in .env from old docs. */
export const LEGACY_INTEGRATION_ORG_ID = "11111111-1111-4111-8111-111111111111";

const ORG_ID_ENV_KEYS = ["PILOT_ORGANIZATION_ID", "DEMO_ORGANIZATION_ID"] as const;

/** Drop stale org UUIDs so pilot CLIs resolve from DATABASE_URL instead. */
export function clearStalePilotOrgEnv(): void {
  for (const key of ORG_ID_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    if (value === LEGACY_INTEGRATION_ORG_ID) {
      delete process.env[key];
    }
  }
}
