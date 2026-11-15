# Migration rollback notes (014–017+)

Apply forward only with `pnpm --filter aegis-api db:migrate`.

| Version | Purpose | Rollback |
|---------|---------|----------|
| 014_forensic_bank | Bank authority, field policy, cases | `DROP` bank_* / membership_bank_role tables after confirming no production dependency. Prefer restore from backup. |
| 015_forensic_receipt | forensic_receipt + append-only triggers | Dropping triggers re-enables UPDATE/DELETE on sealed events — **do not** on pilot data. Restore from backup. |
| 016_approval_delegate | Time-bound delegation table | `DROP TABLE approval_delegate;` |
| 017_workflow_run_org_cascade | FK cascade for org delete in tests | Re-add prior FK without CASCADE if needed; safe for app traffic. |

**Upgrade test checklist**

```powershell
# 1) Create DB at baseline schema (tag pre-forensic-demo), load sample
# 2) Point DATABASE_URL at it, run migrate on this branch
pnpm --filter aegis-api db:migrate
# 3) Confirm policies, receipts, and aegis-verify still work
pnpm --filter aegis-api export:scenario-bundles
```

Script helper: `pnpm exec tsx tools/scripts/upgrade-migrate-check.mts` (when DATABASE_URL set).
