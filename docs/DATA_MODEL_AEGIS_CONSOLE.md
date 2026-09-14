# Data model — Aegis console metadata (tenancy & control plane)

**Purpose:** Application metadata for **authenticated** Aegis product surfaces — **distinct** from APS-1 high-volume event storage (those tables defined in Aegis backend migrations phasewise).

Logical DB suggestion: **`aegis_meta`** on Neon OR schema `aegis` inside same Neon project until split.

---

## 1. Identity linkage

Users authenticate via **Auth.js** (`@salanor/auth`). Identity is anchored on our **`User`** table (Prisma). Persist mapping for console tenancy:

### `identity_links`
| Column | Notes |
|--------|-------|
| id uuid PK | |
| user_id text UNIQUE | FK → Auth.js `User.id` (stable internal id) |
| primary_email text | snapshot |
| created_at | |
| updated_at | |

Indexes: `(user_id)`

---

## 2. Tenant (organization)

### `organizations`
| Column | Notes |
|--------|-------|
| id uuid PK (`tenant_id`) | |
| name | display |
| slug UNIQUE | DNS-safe unique |
| external_org_id text UNIQUE nullable | Future SAML/WorkOS org id (`AUTH-A5`); null for native orgs |
| plan text | starter/team/business placeholder |
| created_at | |

---

## 3. Membership & RBAC

### `organization_memberships`
| Column | Notes |
|--------|-------|
| id uuid PK | |
| organization_id FK | |
| identity_link_id FK | |
| role enum | `owner`, `admin`, `developer`, `compliance`, `viewer` |
| invited_by | nullable FK identity |
| created_at | |
| UNIQUE (organization_id, identity_link_id) | |

**Role semantics (default)** — expand in ACCESS_CONTROL_MATRIX:

| Role | Description |
|------|-------------|
| owner | Billing + destructive + invites |
| admin | User management, settings |
| developer | API keys, ingest config |
| compliance | Read-only sensitive exports |
| viewer | Dashboard read-only |

---

## 4. API credentials

### `api_keys`
| Column | Notes |
|--------|-------|
| id uuid PK | |
| organization_id FK | |
| name | human label |
| prefix | e.g. `att_live_` |
| secret_hash | **never store raw** after creation |
| scopes jsonb | optional fine-grained |
| created_by | identity |
| revoked_at | nullable |
| last_used_at | nullable |

---

## 5. Environments (optional but future-proof)

### `environments`
| Column | Notes |
|--------|-------|
| id uuid PK | |
| organization_id FK | |
| name | `production` / `sandbox` |
| ingest_endpoint | URL / region |
| created_at | |

FK from keys → environment (optional).

---

## 6. Billing placeholders (Phase N)

### `subscriptions`
| Column | Notes |
|--------|-------|
| id | |
| organization_id | |
| stripe_customer_id | when integrated |
| status | |
| current_period_end | |

(Stub until payments live — keep migration lightweight.)

---

## 7. Administrative audit (console actions)

### `console_audit_log`
| Column | Notes |
|--------|-------|
| id uuid PK | |
| organization_id nullable | null = internal superadmin context |
| actor_identity_id | |
| action | enum text (`role_changed`, `api_key_created`, `export_requested` …) |
| target_type | |
| target_id | |
| metadata jsonb | diff snapshot |
| created_at | |

**Immutability:** append-only via DB role permissions (no UPDATE/DELETE for app role).

---

## 8. Internal Salanor staff overlay

### `sal_internal_users`
| Column | Notes |
|--------|-------|
| identity_link_id FK UNIQUE | |
| role enum | `superadmin`, `eng`, `support` |
| expires_at | contractors |

Superadmin capabilities governed strictly in **`ACCESS_CONTROL_MATRIX.md`**.

---

## 9. Future cross-link to event domain

### `event_index_stub` (optional Phase 3+)

Lightweight mapping for console search before full Clickhouse/ES — may store `(organization_id, aps_event_id, recorded_at, action)` — **only if** query load demands; else query Aegis read-plane service.

---

## Related

- **`ACCESS_CONTROL_MATRIX.md`**  
- **`FUNCTIONAL_REQUIREMENTS_SPEC.md`** (FR-aegis-console-*)  
