# OPA policy bundle

- **Source:** `rego/default.rego` (entrypoint `aegis/decision`)
- **Artifact:** `policy.wasm` (committed; used by `@open-policy-agent/opa-wasm`)

Rebuild after editing Rego:

```bash
pnpm --filter aegis-api policy:build-wasm
```

Requires Docker and the `openpolicyagent/opa:0.70.0` image.
