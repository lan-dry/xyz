# Data model — Corporate web & CMS-light (Postgres / Prisma)

**Source of truth:** `Salanor_Website_Specification.pdf` §12 (CMS-light schema).

**DB:** Logical database `salanor_web` on Neon (recommended separation from Aegis operational DB).

---

## 1. Enum reference (Postgres `ENUM` or text + check — Prisma prefers `String` + app validation early; migrate to native ENUM when stable)

### `contact_reason`
- `design_partner`
- `press`
- `careers`
- `security`

### `contact_status`
- `new`
- `triaged`
- `replied`
- `archived`

### `research_track`
- `provenance`
- `replayability`
- `standards`
- `policy`
- `field_notes`

### `research_status`
- `draft`
- `scheduled`
- `published`

### `role_location`
- `remote_global`
- `remote_eu`
- `remote_us`
- `hybrid`

### `employment_type`
- Values TBD in Prisma seed (e.g. `full_time`, `contract`) — align careers page copy.

### `open_role_status`
- `open`
- `closed`

---

## 2. Tables

### `account` (byline fields)
Staff public research byline lives on the Salanor ID account row (see `docs/RESEARCH_ATTRIBUTION.md`):

| Column | Type | Notes |
|--------|------|-------|
| byline_name | text | Public name on www/research |
| byline_title | text | Title / affiliation |
| byline_bio | text | Short bio |
| byline_photo_url | text | Optional headshot |

### `research_posts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| slug | text UNIQUE | |
| title | text | |
| dek | text | short summary |
| body | text | MDX serialized **or** filesystem pointer + DB row metadata only (hybrid pattern) |
| author_account_id | uuid FK → account | Byline account (publisher) |
| published_by_account_id | uuid FK → account | Audit: who published |
| last_edited_by_account_id | uuid FK → account | Audit: last save in Ops |
| track | research_track | |
| published_at | timestamptz | nullable until published |
| updated_at | timestamptz | |
| reading_minutes | int | denormalized helper |
| hero_image_url | text | |
| og_image_url | text | |
| status | research_status | |

**Implementation note:** Prefer **MDX on disk** Git-authoritative with DB row for ordering & metadata — still satisfy spec admin filters; document chosen pattern in IMPLEMENTATION_PLAN.

### `open_roles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| slug | text UNIQUE | |
| title | text | |
| team | text | |
| location | role_location | |
| seniority | text | |
| employment_type | employment_type | |
| summary | text | MDX |
| requirements | text | MDX |
| compensation_range | text | optional transparency policy |
| posted_at | timestamptz | |
| closes_at | timestamptz nullable | |
| status | open_role_status | |

### `contact_messages`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| created_at | timestamptz | |
| name | text | |
| email | text | lowercased |
| organization | text | |
| role | text | sender job title |
| reason | contact_reason | |
| message | text | |
| source_path | text | page path for analytics |
| ip_hash | text | salted hash only |
| status | contact_status | |

**RLS:** INSERT allowed for limited service role from edge function; SELECT admin only (per spec).

### `newsletter_subscribers`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | text | unique via `lower(trim(email))` |
| created_at / updated_at | timestamptz | |
| confirmed_at | timestamptz nullable | set after double opt-in |
| confirm_token | text unique nullable | cleared after confirm |
| confirm_token_expires_at | timestamptz nullable | default 72h |
| unsubscribe_token | text unique | permanent per row; use in List-Unsubscribe |
| unsubscribed_at | timestamptz nullable | soft unsubscribe (do not DELETE) |
| source | text | e.g. `website_footer` |
| signup_ip_hash | text nullable | salted hash |

See **`docs/NEWSLETTER.md`** for flows and API routes.

---

## 3. Indexes (minimum)

| Table | Index |
|-------|-------|
| research_posts | `(status, published_at DESC)` |
| open_roles | `(status, posted_at DESC)` |
| contact_messages | `(status, created_at DESC)` |
| newsletter_subscribers | `(email)` |

---

## 4. RLS outline (SQL migrations alongside Prisma)

Policy sketch (non-final SQL — implement with security review):

```sql
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY insert_contact ON contact_messages
  FOR INSERT TO authenticated_service_role
  WITH CHECK (true);

CREATE POLICY select_contact_admin ON contact_messages
  FOR SELECT TO authenticated_admin_role
  USING (true);
```

**Reality check:** With **Neon + Prisma** you may use **singleton server role** plus **application-level checks** until dedicated DB roles exist — **document chosen pattern** in IMPLEMENTATION_PLAN Phase 1 tasks.

---

## 5. Notifications (per spec)

Insert `contact_messages` → trigger **Slack incoming webhook** asynchronously (do not block HTTP success path >500ms SLA if avoidable — queue via background job or Vercel waitUntil pattern).

---

## 6. Seeds

- At least one unpublished research stub (internal)  
- Example open role (staging only)

---

## Related

- **`ACCESS_CONTROL_MATRIX.md`** — internal admin vs public  
- **`DIGITAL_ARCHITECTURE.md`** route map
