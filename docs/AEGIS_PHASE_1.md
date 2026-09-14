# Aegis Phase 1 — Corporate Web, CMS-Light, Neon + Auth.js Shell

**Phase ID:** P1  
**Objective:** Deliver **public credibility surface** aligning with **`Salanor_Website_Specification.pdf`**.

**Status:** **Closed in repo** · 2026-05-16 (staging URL checklist remains operator-owned)

---

## Scope IN

| Area | Deliverable |
|------|-------------|
| Next.js routes | Canonical IA per `DIGITAL_ARCHITECTURE.md` |
| Styling tokens | Tailwind v4 curated palette (--ink,--bone,--teal) |
| Postgres | Neon `salanor_web` + Prisma models per `DATA_MODEL_WEB.md` |
| Contact | Persist + Slack notify + rate-limit |
| Research | MDX pipeline + index skeleton |
| Careers | Roles list from DB |
| Admin gate | Auth.js-protected internal ops shell (`/admin`) with contacts triage + research/careers CMS + read-only org/user views |
| Observability | Sentry wired |
| Deploy | Staging preview on Vercel |

---

## Scope OUT

| Item | Deferred |
|------|----------|
| `/aegis/docs` exhaustive reference | Increment P1→P2 (stub page ok) deep nav |
| Pagefind indexing automation | Finish when content volume warrants |
| Aegis ingestion cloud | P2 |

---

## Acceptance criteria

1. Lighthouse thresholds spec §13 ±10% concession documented if fail with rationale ticket.  
2. Contact SLA: INSERT <300ms median excluding Slack sidecar.  
3. `contact_messages` RLS posture documented—even if iterative app guard first.  
4. Content parity: flagship `/aegis` sections present per spec headings.  

---

## P1 exit checklist (repo)

| Criterion | Status | Notes |
|-----------|--------|-------|
| Canonical routes (`/`, `/about`, `/aegis`, `/aether`, `/research`, `/careers`, `/contact`, `/standards`, `/legal/privacy`, `/admin`, `/sign-in`) | Done | `/aegis/docs` stub; `/sign-up` → `/sign-in` |
| Contact API persist + rate limit + honeypot | Done | `POST /api/contact` |
| Slack notify (optional) | Done | `SLACK_CONTACT_WEBHOOK_URL`; non-blocking |
| Admin Auth.js magic link + allowlist | Done | `AUTH-A1`; `@salanor/auth` with route-grouped admin shell |
| `/aegis` SDK snippet + `pnpm aegis:demo` | Done | `FR-WEB-AEGIS-CODE` |
| Research index + RSS | Done | `/research/feed.xml` |
| Careers from Prisma seed | Done | `pnpm db:seed` |
| JobPosting JSON-LD | Done | `/careers/[slug]` |
| `.env.example` + README deploy | Done | Vercel + Neon + Postmark |
| `pnpm build` green | Verify locally | CI / operator |
| Sentry (`SENTRY_DSN`) | Done | instrumentation + contact capture |
| Lighthouse baseline | Documented | See root `README.md` § Lighthouse |
| `contact_messages` RLS | Documented | App-layer guard now; SQL in `DATA_MODEL_WEB.md` §4 |

### RLS posture (iterative)

- **Now:** Inserts only via `POST /api/contact` (validated, rate-limited, salted IP hash). Admin reads via Prisma behind Auth.js + `isAllowedAdminEmail`.
- **Next:** Enable Neon RLS policies from `DATA_MODEL_WEB.md` §4 when moving off app-only guards.

### Lighthouse

Run against a production build (not `next dev`). Baseline command in root `README.md`. If budgets fail, open a ticket with route, score, and ±10% concession rationale per spec §13.

---

## Exit artifacts

Staging URL checklist (private Notion/link doc ok).  

---

## Dependencies

P0 APS draft stability (snippet import references).
