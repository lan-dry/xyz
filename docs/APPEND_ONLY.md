# Append-only sealed events

**Schema:** `services/aegis-api/migrations/001_baseline.sql` (append-only triggers + forbid functions)  
**Rule:** After an event is sealed, identity and hash-chain columns must not change.

## Application database role

The runtime app role (connection string used by `aegis-api`) **must not**:

- Be a PostgreSQL superuser
- Hold `REPLICATION` / ability to `SET session_replication_role`
- Own or disable the append-only triggers

Triggers fire for ordinary `UPDATE`/`DELETE` and refuse mutations. That is the production guarantee.

## `session_replication_role = replica`

Used **only in test teardown / intentional tamper fixtures**:

| File | Purpose |
|------|---------|
| `test/integration-fixture.ts` | Clear sealed events before re-seed |
| `test/helpers.ts` (`cleanupIsolationFixtures`) | Clear `evt-test-%` events |
| `test/witness.integration.test.ts` | Intentional hash tamper for verify-negative |
| `test/forensic-org-isolation.integration.test.ts` | Isolation teardown |

**Critical:** While `session_replication_role = replica`, PostgreSQL disables user triggers **and FK CASCADE**. Never `DELETE FROM organization` in that mode — orphan policies will remain and can flip deny→allow in later tests. Clear events under replica, then delete org/policies under `DEFAULT`.

## Tenant wipe (demo/test tenants only): the one sanctioned deletion path

`001_baseline.sql` defines `platform_wipe_tenant()`, a SECURITY DEFINER function owned by the
schema owner and callable only through the owner connection (`pnpm pilot:wipe-tenant`). It refuses any
organisation that is not `is_demo`/`is_test`, deletes only that organisation's rows, and disables the
`trg_*_append_only` triggers with `ALTER TABLE ... DISABLE TRIGGER` **inside its own transaction** (re-enabled
before return; never visible to other sessions; rolled back on error). It does not use
`session_replication_role`, and the app role is granted nothing. See `docs/DEPLOY_PRODUCTION.md` §10.1.

## Verify

```sql
-- As the app role (not superuser):
UPDATE event SET event_hash = event_hash WHERE false; -- should be allowed (no-op)
-- Any real mutation of sealed identity/hash fields must raise append_only.
```

Ops: provision the app role without bypass privileges; keep migrations/superuser for DDL only.

## Backup restore with `--disable-triggers`

`pg_restore --disable-triggers` bypasses append-only triggers and is **demo-only**. The backup-restore drill refuses when `NODE_ENV`/`AEGIS_ENV` is `production`, and otherwise only runs when `AEGIS_ALLOW_DISABLE_TRIGGERS_RESTORE=true` is set in the shell (`tools/backup-restore-drill/disable-triggers-guard.ts`). `AEGIS_DEMO_MODE` no longer has any effect here or anywhere else.
