# Append-only sealed events

**Migration:** `services/aegis-api/migrations/015_forensic_receipt.sql`  
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

## Verify

```sql
-- As the app role (not superuser):
UPDATE event SET event_hash = event_hash WHERE false; -- should be allowed (no-op)
-- Any real mutation of sealed identity/hash fields must raise append_only.
```

Ops: provision the app role without bypass privileges; keep migrations/superuser for DDL only.
