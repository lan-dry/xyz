# LangGraph + Aegis (Phase 4 sample)

Minimal pattern: wrap a tool with `wrapLangGraphTool` inside `bridge.withTrace()` so policy evaluate + signed APS-1 events land in the Console (Live feed → Verify).

This does **not** depend on `@langchain/*` — it mirrors a LangGraph tool handler shape so you can drop the same wrapper into a real graph.

## Prerequisites

1. Local `pnpm dev` (aegis-api on `:8080`) or a deployed API.
2. Console → Agents → create/copy ingest credentials into `.env`.

```bash
cp .env.example .env
# fill AEGIS_* from Console
pnpm install
pnpm start
```

Open the printed Console URL → receipt should Verify.

## Fail modes

Pass `failMode: "fail_closed"` (default) or `"fail_open_buffer"` into `wrapFetch` / bridge fetch helpers when Aegis may be offline. See `@salanor/aegis` `drainSignedEventBuffer`.
