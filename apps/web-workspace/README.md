# web-workspace (Salanor Workspace)

Governed staff chat UI. Local dev on port **3004**.

```bash
pnpm --filter @salanor/web-workspace dev
```

Product name in the UI is **Workspace** (not Stoa). Internal packages/routes may still use `stoa` as a code identifier (`stoa-api`, `/v1/stoa`, `STOA_*` env).
