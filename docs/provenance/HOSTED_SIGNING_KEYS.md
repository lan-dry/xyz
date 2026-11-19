# How the hosted demo receives signing keys

Demo Bank (and other disposable `is_demo` / `is_test` tenants) never commit private
keys to git. Delivery is local-provision + register-public-only.

## Local / CI demo

1. `pnpm pilot:provision-demo-tenant` (or `pnpm demo:fresh`) generates Ed25519 key
   pairs for `src_los`, `src_core`, `src_pay` (and bureau when used).
2. **Private keys** land under `.data/connectors/<source_id>/private.key` (gitignored).
3. **Public keys** are registered on the tenant via the Sources / registry API
   (`kind=system` or `third_party`) with the matching `key_id`.
4. `pnpm demo:connectors` starts one Connector process per source (`:8787` / `:8788` /
   `:8789`) reading those private keys and posting AEGIS-SRC1 to
   `/v1/aegis/source-events` with the tenant ingest bearer.
5. Receipt / decision-token signing uses `AEGIS_RECEIPT_*` (env or KMS) on the API
   host — separate from source keys; also never committed.

## Hosted demo

The hosted Demo Bank image/process receives the same material through **runtime
secrets**, not the repo:

- Ingest bearer and receipt signing seed/key id from the platform secret store /
  environment of the demo deployment.
- Source Connector private keys from a mounted secret volume or generated at
  provision time into a non-versioned volume, then public halves registered once.
- Operators rotate by registering a new `key_id`, switching Connectors, then
  revoking the old key; wipe of the demo tenant removes registry rows and audit
  is written to `platform_tenant_wipe_audit`.

## Checks

- `.env` / `.env.local` / `.env_deploy` are gitignored (not in the current tree).
- `gitleaks` scans the working tree in CI (`--no-git`). History may still show a retired
  `.env_deploy` blob from before it was untracked — treat those values as **compromised /
  rotate**; do not allowlist historical deploy secrets.
- Conformance vectors and provenance `_raw` / TEST_PACK artifacts that look like `key_id`
  or UUIDs are allowlisted false positives, not live private keys.
