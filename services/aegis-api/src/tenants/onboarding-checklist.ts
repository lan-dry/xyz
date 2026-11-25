import type pg from "pg";

export const ONBOARDING_FLAGS = [
  "create_api_key",
  "send_first_event",
  "see_sealed",
  "approve_held",
  "verify_bundle",
  "invite_colleague",
] as const;

export type OnboardingFlag = (typeof ONBOARDING_FLAGS)[number];

/** Set one checklist flag when the step actually happens. Sandbox orgs only. */
export async function markOnboardingStep(
  db: pg.Pool | pg.PoolClient,
  organizationId: string,
  flag: OnboardingFlag,
): Promise<void> {
  await db.query(
    `UPDATE organization
        SET onboarding_checklist =
              COALESCE(onboarding_checklist, '{}'::jsonb)
              || jsonb_build_object($2::text, true)
      WHERE organization_id = $1
        AND tenant_kind = 'sandbox'`,
    [organizationId, flag],
  );
}
