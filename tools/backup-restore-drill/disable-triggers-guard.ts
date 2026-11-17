/**
 * Guard for pg_restore --disable-triggers (bypasses append-only).
 * Refuses production. Local drills must set AEGIS_ALLOW_DISABLE_TRIGGERS_RESTORE=true.
 */
export function assertDisableTriggersRestoreAllowed(): void {
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const aegisEnv = (process.env.AEGIS_ENV ?? "").toLowerCase();
  const isProd = nodeEnv === "production" || aegisEnv === "production";
  const allowed =
    (process.env.AEGIS_ALLOW_DISABLE_TRIGGERS_RESTORE ?? "").trim().toLowerCase() ===
    "true";
  if (isProd || !allowed) {
    throw new Error(
      "pg_restore --disable-triggers refused: set AEGIS_ALLOW_DISABLE_TRIGGERS_RESTORE=true on a non-production process only",
    );
  }
}
