# stoa-api

Stoa control plane API: threads, chat, DLP, audit, OpenAI-compatible gateway (Phase 1).

## Local setup

1. Create database `stoa` (separate from `aegis`):

   ```bash
   createdb stoa
   ```

2. In repo-root `.env.local`:

   ```env
   STOA_DATABASE_URL=postgresql://salanor:salanor@127.0.0.1:5432/stoa
   STOA_API_PORT=8094
   STOA_WORKSPACE_ORIGIN=http://localhost:3004
   # Optional — real model replies:
   # STOA_OPENAI_API_KEY=sk-...
   ```

3. Migrate + dev tenant:

   ```bash
   pnpm --filter stoa-api db:migrate
   pnpm --filter stoa-api db:seed:dev
   ```

4. Run:

   ```bash
   pnpm --filter stoa-api dev
   ```

**Auth (demo):** Sign in at http://localhost:3004/login (Salanor ID — same users as Aegis Console).  
Requires `id` + `SALANOR_ID_URL` on stoa-api. Optional dev header auth: `STOA_ALLOW_DEV_AUTH=1` + `X-Stoa-Dev-User`.
