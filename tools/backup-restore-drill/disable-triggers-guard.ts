/**
 * Guard for pg_restore --disable-triggers (bypasses append-only).
 * Same policy as demo:reset: refuse production env or when demo mode is off.
 *
 * Kept local so the drill CLI does not import the full aegis-api graph.
 * Keep behaviour in sync with `assertDisableTriggersRestoreAllowed` in
 * `services/aegis-api/src/bank/demo-clock.ts` (tested there).
 */
export function assertDisableTriggersRestoreAllowed(): void {
  const demoOn = process.env.AEGIS_DEMO_MODE === "true";
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const aegisEnv = (process.env.AEGIS_ENV ?? "").toLowerCase();
  const isProd = nodeEnv === "production" || aegisEnv === "production";
  if (isProd || !demoOn) {
    throw new Error(
      "pg_restore --disable-triggers refused: AEGIS_DEMO_MODE is not enabled, or process is production (NODE_ENV/AEGIS_ENV)",
    );
  }
}
