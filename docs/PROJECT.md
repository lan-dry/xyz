# PROJECT.md — Salanor Engineering & Product Constitution

**Version:** 1.0 · **May 2026**

---

## 1. Mission anchor

Salanor builds **trust & accountability infrastructure** for autonomous and AI-driven systems.  
**Aegis** is the flagship product: a **verifiable decision record** — capture, anchor, replay, export — with a later **Policy (enforcement)** pillar.  
**Aether** is the public research programme (standards incl. APS-1 drafting).

Authoritative narrative + copy for marketing live in **`Salanor_Website_Specification.pdf`**. Visuals in **`Salanor_Website_Design.pdf`** (layout only).

---

## 2. Repository baseline

| Decision | Value |
|----------|--------|
| Git host | GitHub **Organization** (`salanor` or chosen slug) |
| Monorepo tooling | **Nx** |
| Primary web language | TypeScript **strict** |
| Web framework | **Next.js** (React 19 compatible path) |
| Styling | Tailwind CSS **v4** + design tokens (`--ink`, `--bone`, `--teal` … per Website Spec) |
| ORM (web plane) | **Prisma** targeting **Neon Postgres** |
| Auth | **Auth.js v5** in **`@salanor/auth`**; sessions in Postgres; org/RBAC in Prisma (see **`AUTH_ROADMAP.md`**) |
| Edge host | **Vercel** |
| Marketing analytics | Plausible |
| Errors | Sentry |
| Emails | Postmark + Buttondown |

---

## 3. Planes & boundaries

| Plane | Code location (proposed) | Data |
|-------|-------------------------|------|
| Corporate site + admin | `apps/web` (Nx) | DB: `salanor_web` logical |
| Aegis console | `apps/console-aegis` (future) | Same Neon project **separate DB** `aegis_meta` OR isolated schema + strict code boundaries |
| SDKs | `packages/aegis-sdk-*` | Published artifacts |
| Backend services | `services/*` | Containers on Fly.io (default) |

Hard rule: **marketing contact rows never co-mingle** with cryptographic event storage tables at scale.

---

## 4. Documentation law of the land

Ordering: see **`DOCUMENT_INDEX.md`**.

Functional truth: **`FUNCTIONAL_REQUIREMENTS_SPEC.md`** (FR IDs).

Sequencing truth: **`IMPLEMENTATION_PLAN.md`**.

Slice truth: **`AEGIS_PHASE_*.md`**.

Infrastructure truth: **`INFRASTRUCTURE_DECISIONS.md`**.

---

## 5. Definition of Done (global)

A feature is DONE when:

1. **Automated tests** cover happy + critical failure path (where feasible).  
2. **Typecheck + lint** passes in CI (`nx affected`).  
3. **Security review** for public inputs (rate limit, validation, no secret logs).  
4. **Docs**: user-facing MDX or changelog entry if behavior visible.  
5. **Observability hooks** (structured log + trace span) for new services.  
6. **Tenant isolation test** (console path) — regression where applicable.  
7. **Access control**: row added/updated in **`ACCESS_CONTROL_MATRIX.md`** if role surface changes.

---

## 6. Language & naming

| Term | Meaning |
|------|--------|
| **Aegis Policy** | Product pillar for **authorization / enforcement gates** (allow/deny) before or while recording — every policy decision also evented. |
| **APS-1** | Public wire event schema (draft). |
| **Tenant** | Customer organization (`organization_id` / `tenant_id`). |

Words to avoid in public copy: hype adjectives from Website Spec “don’t” list.

---

## 7. Non-goals (explicit)

- Building training / custom models for customer scoring (Aegis records; it does not compete with model builders).  
- Promising **court-admissible** outcomes before counsel review.  
- Merging unsecured admin routes into public ISR pages.

---

## 8. Appendix A — phased delivery pointer

Concrete engineering slices: **`AEGIS_PHASE_0.md`** → **`AEGIS_PHASE_6.md`**.
