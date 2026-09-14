# Access control matrix — Salanor

**Version:** 1.0**

Legend: ✅ allowed · ❌ denied · 🔭 read-only · ⚙️ gated (break-glass) · — N/A

---

## 1) Planes & actors

### A. Anonymous public web (`salanor.com`)

Actor: Visitor

| Resource | Capability |
|----------|------------|
| Marketing pages | READ |
| Research published | READ |
| Contact form | CREATE message (rate-limited) |
| Newsletter signup | CREATE subscriber |
| Admin paths | ❌ |

---

### B. Internal Salanor (`admin.salanor.com`)

| Role | CMS publish | View contacts | View newsletter | Manage roles | Infra secrets | Impersonate tenant |
|------|------------|--------------|----------------|-------------|--------------|--------------------|
| `sal_superadmin` | ✅ | ✅ | ✅ | ✅ | ⚙️ policy | 🔭 later (must be audited + contractual) |
| `sal_eng` | 🔭 | ❌* | ❌ | ❌ | ⚙️ CI only | ❌ |
| `sal_support` | ❌ | ✅ triage | 🔭 | ❌ | ❌ | ❌ |

\*Unless dual-hat exception documented per incident.

**Source of role:** `sal_internal_users.role` (`superadmin` | `eng` | `support`) via `@salanor/auth` + `apps/web` admin RBAC (`AUTH-A1`). `ADMIN_EMAILS` is dev bootstrap only.

---

### C. Customer tenant console (`app.aegis…`)

| Role | Invite users | Manage billing | API keys | View events | Trigger export | Change org policy settings |
|------|-------------|---------------|----------|-------------|---------------|---------------------------|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | 🔭 (optional flag) | ✅ | ✅ | ✅ | ✅ |
| developer | ❌ | ❌ | ✅ | ✅ | ❌* | 🔭 technical |
| compliance | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| viewer | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

\*Developer may request export → workflow approval (future).

**Tenant isolation:** Every query **must** filter `organization_id = activeTenant`.

---

## 2) Service accounts (machine)

| Token | Scope |
|-------|-------|
| Edge ingest (collector) | Write APS-1 events **only** for configured org + env |
| Replay reader | READ sealed events |

Keys rotated; stored hashed with metadata row.

---

## 3) Aegis Policy pillar (future)

Policy decisions emitted as **their own APS-1 events** with `action` prefix `policy.*` — auditors see allow/deny + rule id/version.

Evaluation engine **must not** silently fail closed vs open — document default (**deny**) for high-risk integrations.

---

## 4) Audit obligations

| Event | Logged in |
|-------|-----------|
| Role change | `console_audit_log` |
| API key creation / revoke | `console_audit_log` |
| Evidence export job | `console_audit_log` + APS-1 decision event (product plane) |
| Internal superadmin read of PII | `console_audit_log` + ticket reference |

---

## 5) Collaboration models (future)

| Pattern | Description |
|---------|-------------|
| Intra-tenant | Default — shared org workspace |
| Guest reviewer | Scoped token to single export bundle + expiry |
| Cross-tenant | ❌ default — requires legal contract + strict architecture |

---

## 6) Testing requirements

- Automated **tenant leak** tests (cross join attempt must return 0).  
- RBAC matrix smoke tests per role in CI (contract tests against API layer).

---

## Revision

Update this file **whenever** a new console route ships.
