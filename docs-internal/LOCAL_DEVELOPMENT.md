# Run the Salanor stack locally

**Salanor engineering only.** Customers integrate via [Getting started](../docs/) in their own apps — not this guide.

## Prerequisites

- Node 22+, pnpm, Docker
- Clone `salanor` monorepo

## Start services

```bash
cd salanor
docker compose up -d
pnpm db:migrate
pnpm db:seed   # optional dev accounts + platform_staff for dev@salanor.local
pnpm dev
```

## Local URLs

| Service | URL |
|---------|-----|
| Aegis Console | http://localhost:3000 |
| Docs (customer) | http://localhost:3002 |
| Aegis API | http://localhost:8080 |
| Salanor ID | http://localhost:8091 |
| Platform Ops | http://localhost:3003 |
| Marketing | http://localhost:3001 |

## More

- [DEV.md](../docs/DEV.md) — full developer guide
- [COMMANDS.md](../docs/COMMANDS.md) — command reference (also in Platform Ops → **Commands**)
- [PLATFORM_OPS.md](./PLATFORM_OPS.md) — internal admin app
- [PILOT_WALKTHROUGH.md](../docs/PILOT_WALKTHROUGH.md) — demo script
