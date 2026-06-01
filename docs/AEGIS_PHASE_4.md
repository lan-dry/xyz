# Aegis Phase 4 — Tenant Console & RBAC

**Phase ID:** P4  
**Status:** Engineering complete (deferments tracked)

---

## Deploy choice

**Console lives at `apps/web/src/app/console`** (`https://salanor.com/console` locally) — same Next deploy as marketing for speed. `DIGITAL_ARCHITECTURE.md` still recommends `app.aegis.salanor.com` / `apps/console-aegis` when cookie isolation warrants a split.

---

## Deliverables

| Module | Capability | Status |
|--------|------------|--------|
| Auth | `@salanor/auth` + Prisma org membership (`AUTH-A4`; `AUTH-A3` 2FA stub) | MVP |
| Data | `DATA_MODEL_AEGIS_CONSOLE.md` entities | MVP |
| RBAC | `requireRole` + route contract coverage | Complete |
| API keys | Create / list prefix / revoke + bcrypt hash + ingest auth | Complete |
| Search UI | Minimal event table (`time`, `event_id`, `trace_id`) | MVP |
| Audit | `console_audit_log` append for keys, roles, console sign-in | MVP |

---

## Checklist

- [x] Prisma: `organizations`, `organization_memberships`, `identity_links`, `api_keys`, `console_audit_log`
- [x] `aegis_ingest_events.organization_id` on ingest (dev org default)
- [x] `/console` UI + `/api/console/*` routes
- [x] Org switcher + role from membership
- [x] `ADMIN_EMAILS` only gates `/admin` — console uses org RBAC
- [x] Cross-tenant + API key hash vitest (`pnpm web:test`)
- [ ] AUTH-A3: TOTP + full auth audit stream
- [x] Ingest auth via hashed API keys (with optional `AEGIS_INGEST_DEV_KEY` fallback for smoke)
- [ ] Invite flow / billing / environments table
- [x] RBAC contract tests per role in CI
- [ ] Separate `app.aegis` deploy + cookie boundary

---

## Acceptance criteria

1. Automated cross-tenant query attempts **must fail**. — **Yes:** query builder + membership guard + RBAC route contract tests.
2. `console_audit_log` records role changes immutably. — **Yes** (append-only app path).
3. Key leak simulation test ensures raw secret absent in DB/logs. — **Yes** (`api-keys.test.ts`).

---

## Local verification

```bash
pnpm install
pnpm db:push
pnpm db:seed
# .env: AEGIS_CONSOLE_AUTO_PROVISION=1 AEGIS_DEV_ORGANIZATION_ID=00000000-0000-4000-8000-000000000010
pnpm dev
# Sign in once (admin or any user with auto-provision) → http://localhost:3000/console
# If flag is enabled and provisioning fails, console now shows actionable diagnostics.
pnpm aegis:ingest-demo   # events appear under dev org
pnpm web:test
pnpm build
```

## Ingest auth headers

- Preferred: issue org key in console (`/console/api-keys`) and send `Authorization: Bearer <att_live_...>`.
- Also supported: `X-Aegis-Api-Key: <att_live_...>`.
- Optional dev fallback for smoke scripts: `AEGIS_INGEST_DEV_KEY` (same header formats).

---

## Dependencies

P3 replay/read plane authenticated routes available.

**Deferred / out of scope (this slice):** invites, billing, environments table UX, separate `app.aegis` deploy + cookie split, full TOTP/AUTH-A3 hooks, OTS reconcile enhancements, P5/P6, full policy engine, Rust collector.
