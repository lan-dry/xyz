# Release notes — forensic-demo-readiness (not merged)

Against tag `pre-forensic-demo`. **Do not merge or deploy from this document alone.**

## Behaviour for existing customers

- **Default unchanged:** policy combine remains prior default unless a pack sets `combine: all_matching`.
- **Dual publish:** opt-in per policy (`dual_publish_required`); off by default.
- **Demo endpoints / clock / seed actors:** unavailable when `NODE_ENV` or `AEGIS_ENV` is production.
- **Append-only:** sealed `event` rows reject UPDATE/DELETE for the application role (migration 015).

## Migrations

See `docs/MIGRATION_ROLLBACK.md` (014–017).

## Feature flags / env defaults

| Flag / env | Default | Notes |
|------------|---------|-------|
| `AEGIS_DEMO_MODE` | unset/false | Required for demo clock + scenario HTTP |
| `AEGIS_DEMO_APPROVAL_PASSWORD` | **none** | Required to seed demo approvers |
| `AEGIS_TSA_URL` | unset | Production RFC 3161 when set |
| `AEGIS_PACK_REQUIRE_SIGNING_KEY` | false | Fail pack:apply if no agent key |
| `AEGIS_RECEIPT_SIGNING_KEY_B64` | unset | Required to issue forensic receipts |

## Diffstat vs `pre-forensic-demo`

```text
# Run locally:
git diff --stat pre-forensic-demo...HEAD
```

## Secret scanning

```powershell
# Example — install gitleaks if needed
gitleaks detect --source . --no-git -v
```

Do not commit `.env`, Resend keys, or demo passwords.
