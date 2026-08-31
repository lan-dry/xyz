# Neon setup (Salanor Production)

**Project:** Salanor Production  
**Project ID:** `icy-sunset-21564044`  
**Organization:** Salanor (`org-tiny-band-18793896`)  
**Region:** AWS Europe Central 1 (Frankfurt)  
**Branch:** `production`

This document records how Neon is wired to the Salanor monorepo. For full production deploy (Fly, Vercel), see `PRODUCTION_DEPLOY.md`.

---

## What Salanor uses on Neon

| Neon service | Used? | Notes |
|--------------|-------|-------|
| **Postgres database** | **Yes** | All backends share one database via `DATABASE_URL` |
| Neon Auth | No | Salanor ID (`services/id`) handles auth |
| Object storage | No | Compliance ZIPs use Fly volume (later R2) |
| Functions | No | Backends run on Fly.io |
| AI gateway | No | Not used |

Only **Postgres** is enabled. That matches our architecture.

---

## What was configured

### 1. Agent skills (repo)

Installed into `.agents/skills/`:

- `neon`
- `neon-postgres`

Install command (already run):

```bash
npx skills add neondatabase/agent-skills -s neon -s neon-postgres -y
```

### 2. Neon CLI

CLI runs via `npx neon@latest` (or install globally: `npm i -g neon`).

Authenticated as your Neon account (OAuth). Profile stored in `C:\Users\landry\.config\neonctl\`.

Useful commands:

```bash
npx neon@latest projects list --org-id org-tiny-band-18793896 -o json
npx neon@latest link --project-id icy-sunset-21564044 -y
npx neon@latest env pull --file .env.local
npx neon@latest connection-string --pooled
npx neon@latest connection-string
```

### 3. Project link file

File: `.neon` (gitignored)

```json
{
  "orgId": "org-tiny-band-18793896",
  "projectId": "icy-sunset-21564044",
  "branch": "production"
}
```

After `neon link`, project-scoped commands know which project and branch to use.

### 4. Environment variables

Neon CLI pulled these into `.env` (gitignored):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **Pooled** connection. Use on Fly apps and all runtime services. |
| `DATABASE_URL_UNPOOLED` | **Direct** connection. Use for `pnpm db:migrate` only. |
| `NEON_BRANCH` | Branch name (`production`). Informational. |

**Local dev:** copy the three Neon lines into `.env.local`, or run:

```bash
npx neon@latest env pull --file .env.local
```

**Fly.io secrets:** set `DATABASE_URL` to the **pooled** value from Neon dashboard or:

```bash
npx neon@latest connection-string --pooled -o plain
```

**Never commit** connection strings to git.

### 5. MCP server (Cursor)

Installed globally for Cursor in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Neon": {
      "url": "https://mcp.neon.tech/mcp"
    }
  }
}
```

**First use in Cursor:** you may be prompted to authenticate with Neon in the browser (same Google account as Neon console).

Useful MCP tools: `list_projects`, `get_connection_string`, `create_project`.

Prefer the **CLI** for migrations and linking; MCP is for ad-hoc queries in the IDE.

### 6. Database migrations

Migrations were applied to Neon **production** branch on first setup:

```bash
# Use direct (unpooled) URL
pnpm db:migrate
```

All registered migrations through `029_account_login_geo` are applied. Do **not** run `pnpm db:seed` on production.

---

## Connection string rules

| Task | Connection |
|------|------------|
| Fly apps, local `pnpm dev` | `DATABASE_URL` (pooled, `-pooler` in hostname) |
| `pnpm db:migrate` | `DATABASE_URL_UNPOOLED` (direct, no `-pooler`) |
| `pg_dump` / restore | Direct only |

---

## Branch workflow (later)

For staging or feature work:

```bash
npx neon@latest checkout dev-my-feature
npx neon@latest env pull --file .env.local
pnpm db:migrate
```

Each branch gets its own connection strings. See Neon docs on branching.

---

## Free plan limits (current)

| Limit | Value |
|-------|-------|
| Storage | 0.5 GB |
| Compute | Autoscale up to 2 CU |
| Scale to zero | Yes when idle |
| Branches | 10 per project |

Upgrade to **Scale** when you add real customer data or need more storage.

---

## Handoff checklist for new engineer

1. Get access to Neon org **Salanor** (invite from console).
2. Install CLI: `npm i -g neon` or use `npx neon@latest`.
3. Clone repo, run `neon link --project-id icy-sunset-21564044 -y`.
4. Run `neon env pull --file .env.local`.
5. Migrations: `DATABASE_URL=$DATABASE_URL_UNPOOLED pnpm db:migrate` (use direct URL).
6. Cursor: MCP **Neon** should appear after auth; CLI is preferred for ops.

---

## Related files

| Path | Purpose |
|------|---------|
| `.neon` | Linked project/branch (gitignored) |
| `.env` / `.env.local` | Local secrets including Neon URLs (gitignored) |
| `.agents/skills/neon/` | Neon agent skill |
| `.agents/skills/neon-postgres/` | Postgres agent skill |
| `docs/PRODUCTION_DEPLOY.md` | Full Fly + Vercel deploy runbook |
