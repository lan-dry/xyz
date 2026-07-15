-- Optional JIT: create account + membership on first successful SSO login

ALTER TABLE organization_sso
  ADD COLUMN IF NOT EXISTS jit_provision BOOLEAN NOT NULL DEFAULT false;
