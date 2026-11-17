/**
 * Tiny env predicates shared by boot guards and receipt signing.
 * No imports from the rest of the service so there are no cycles.
 */

type Env = Record<string, string | undefined>;

/** Production mode for the boot guards is exactly AEGIS_ENV=production. */
export function isProductionEnv(env: Env = process.env): boolean {
  return (env.AEGIS_ENV ?? "").trim().toLowerCase() === "production";
}

/** True for true / on / 1 / yes (any case). */
export function isTruthyFlag(value: string | undefined): boolean {
  return /^(true|on|1|yes)$/i.test((value ?? "").trim());
}

/** The only accepted value of AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION. */
export const INTERIM_SOFTWARE_KEY_VALUE = "interim";

export function isInterimSoftwareKeyAllowed(env: Env = process.env): boolean {
  return (
    (env.AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION ?? "").trim().toLowerCase() ===
    INTERIM_SOFTWARE_KEY_VALUE
  );
}
