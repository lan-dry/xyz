# OpenAPI clients (P8)

Source: `services/aegis-api/openapi/bank-events.openapi.yaml` (versioned as 0.1.0).

## Generate

```powershell
pnpm generate:openapi-clients
# → clients/java and clients/csharp (via tools/generated-clients/generate.mjs)
```

Or manually:

```powershell
npx @openapitools/openapi-generator-cli generate `
  -i services/aegis-api/openapi/bank-events.openapi.yaml `
  -g java -o clients/java --skip-validate-spec

npx @openapitools/openapi-generator-cli generate `
  -i services/aegis-api/openapi/bank-events.openapi.yaml `
  -g csharp -o clients/csharp --skip-validate-spec
```

## Smoke

```powershell
# Spec loads + required paths/schemas
pnpm --filter aegis-api exec vitest run test/openapi-smoke.test.ts

# Hello compile for Java/C# stubs (skips if javac/dotnet missing)
pnpm smoke:openapi-clients
```
