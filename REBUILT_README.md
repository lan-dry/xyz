# Salanor — rebuilt from Cursor transcript + local history

This tree was reconstructed from:

1. **Agent transcript** replay (`tools/scripts/reconstruct-from-transcript.mjs`) — ~583 files  
2. **Cursor Local History** overlay — latest versions of ~427 edited files  

## Use this folder (not `salanor-recovered`)

```powershell
cd D:\PROJECTS\salanor-rebuilt
copy .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` runs `dev:libs` first (builds `@salanor/aegis` and `@salanor/witness-merkle`). If API ports are stuck from a prior run, stop old Node processes on **8080** / **8091** before starting again.

### If you already had a broken install

The rebuilt tree initially omitted `services/*` and `tools/*` from `pnpm-workspace.yaml`, so API packages had no `node_modules` and `tsx` was not on PATH. After pulling the latest `pnpm-workspace.yaml`, run **`pnpm install`** once more.

## Docker ports

If `salanor-redis-1` / `salanor-postgres-1` from the old folder are still running, either stop them or change ports in `docker-compose.yml`.

## GitHub

Your scaffold transcript referenced **`salanor-ltd/salanor` on GitHub**. If that repo exists and is up to date, **clone it** — that beats any reconstruction:

```powershell
git clone https://github.com/salanor-ltd/salanor.git D:\PROJECTS\salanor-github
```

## SDK location

- npm package **`@salanor/aegis`** → `packages/sdk-aegis/` (full TypeScript SDK)  
- **`sdks/python/`** → Python SDK (`salanor-aegis`)  
- **`sdks/go/`**, **`sdks/conformance/`** → Go + test vectors  

## After it runs

```powershell
git init
git add .
git commit -m "Recovered from Cursor transcript"
git remote add origin https://github.com/YOUR_ORG/salanor.git
git push -u origin main
```
