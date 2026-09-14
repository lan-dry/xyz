# Salanor / Aegis — Pre-coding documentation pack

Generated **2026-05-18**. Copy this folder into `salanor/salanor/docs-internal/` when the monorepo is created.

## Contents

### `docs/` (in-repo, copy to `salanor/docs/`)

| Path | Description |
|------|-------------|
| [docs/README.md](./docs/README.md) | Documentation index |
| [docs/blueprint.md](./docs/blueprint.md) | Blueprint summary + pointers |
| [docs/DEV.md](./docs/DEV.md) | Local development (Stage 1 template) |
| [docs/handbook/](./docs/handbook/) | Engineering handbook (starter) |
| [docs/products/aegis/](./docs/products/aegis/) | PRD / TAD / plan indexes |

### `docs-internal/` (contracts)

| Path | Description |
|------|-------------|
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Stages 0–12, exit tests, **+ summary of work shipped since the plan** |
| [REMAINING_WORK.md](./REMAINING_WORK.md) | **Only open work**, categorized (pilots → P2 → P3 → infra) |
| [PLATFORM_OPS.md](./PLATFORM_OPS.md) | Salanor staff app (`:3003` / `ops.salanor.com`) vs customer console |
| [adr/0001-product-url-slug.md](./adr/0001-product-url-slug.md) | Canonical product URL slug is `aegis` |
| [adr/0002-organization-vs-tenant.md](./adr/0002-organization-vs-tenant.md) | Use **organization** in DB/API |
| [adr/0003-p0-console-authentication.md](./adr/0003-p0-console-authentication.md) | API keys + session auth |
| [aps/APS-1-draft-0.1.md](./aps/APS-1-draft-0.1.md) | Event JSON + JCS + Ed25519 |
| [schema/v1/001_initial.sql](./schema/v1/001_initial.sql) | PostgreSQL migrations (source of truth) |
| [schema/v1/schema.dbml](./schema/v1/schema.dbml) | DBML for dbdiagram.io |
| [schema/v1/aegis_database_schema.html](./schema/v1/aegis_database_schema.html) | Visual ERD (Mermaid) |
| [sales/AI_AGENT_DISCOVERY_CHEATSHEET.md](./sales/AI_AGENT_DISCOVERY_CHEATSHEET.md) | Founder discovery: observe / govern / prove |

## Organization vs tenant

**Use `organization`.** See ADR-0002. The original `aegis_database_schema.html` in Downloads used `TENANT`; v1 schema renames it.

## Next step

1. Create GitHub org **`salanor`** and repo **`salanor`** (private).
2. Copy entire `salanor-docs-internal/` contents into the repo root (`docs/` + `docs-internal/`).
3. Start **IMPLEMENTATION_PLAN Stage 1** (monorepo scaffold).
