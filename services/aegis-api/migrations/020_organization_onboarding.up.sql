-- OAuth self-serve: org created with placeholder name/slug until user completes onboarding.
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

UPDATE organization
SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at)
WHERE onboarding_completed_at IS NULL;
