# Salanor Aegis SDKs

All customer-facing language clients live under **`sdks/`**. Shared signing rules are validated in **`sdks/conformance/`** (CI job `sdk-conformance`).

```
sdks/
├── README.md                 ← you are here
├── conformance/              ← cross-language test vectors (golden digests + signatures)
│   └── vectors/
├── typescript/               ← npm @salanor/aegis (full SDK: ingest, wrapFetch, approvals)
├── python/                   ← PyPI salanor-aegis (pilot: sign, ingest, record_*, policy)
└── go/                       ← module github.com/salanor/salanor-go/aegis (sign + ingest + public verify)
```

## Quick reference

| Language | Folder | Package / module | Pilot scope |
|----------|--------|------------------|-------------|
| TypeScript / JavaScript | [`typescript/`](./typescript/) | `@salanor/aegis` | Full (`signAndIngest`, `wrapFetch`, approvals) |
| Python | [`python/`](./python/) | `salanor-aegis` | Pilot (`sign_and_ingest`, `record_*`, `enforce_tool_policy`) |
| Go | [`go/`](./go/) | `github.com/salanor/salanor-go/aegis` | Sign, ingest, public verify |

**Not in `sdks/` yet:** Rust, Java (blueprint only — use HTTP API).

## Why TypeScript was under `packages/` before

The monorepo uses `packages/*` for shared libraries consumed by apps. The TypeScript SDK is now **`sdks/typescript`** so every language sits in one tree; the npm name is still `@salanor/aegis`.

## Conformance

```bash
pnpm sdk:conformance
```

Runs TypeScript (`tools/conformance/sdk-signing.mjs`), `go test` in `sdks/go`, and `pytest` in `sdks/python` against the same JSON vectors.

**No Go installed?** (common on Windows dev laptops)

```bash
pnpm sdk:conformance:ts-py
```

Or manually after you already ran `pip install -e ".[dev]"` in `sdks/python`:

```bash
pnpm --filter @salanor/aegis build
node tools/conformance/sdk-signing.mjs
cd sdks/python && python -m pytest -q
```

## Docs

Customer docs: `apps/web-docs` → `/aegis/sdk`.
