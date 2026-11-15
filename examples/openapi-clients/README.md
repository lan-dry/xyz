# OpenAPI clients (P8)

Source: `services/aegis-api/openapi/bank-events.openapi.yaml` (versioned as 0.1.0).

## Generate

```powershell
# Java
npx @openapitools/openapi-generator-cli generate `
  -i services/aegis-api/openapi/bank-events.openapi.yaml `
  -g java -o examples/openapi-clients/java --skip-validate-spec

# C#
npx @openapitools/openapi-generator-cli generate `
  -i services/aegis-api/openapi/bank-events.openapi.yaml `
  -g csharp -o examples/openapi-clients/csharp --skip-validate-spec
```

## Smoke test

`pnpm --filter aegis-api exec vitest run test/openapi-smoke.test.ts` validates the YAML loads and required paths/schemas exist. Generated Java/C# clients should be pointed at a demo server for live smoke when the generator is available in CI.
