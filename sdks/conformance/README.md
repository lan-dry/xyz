# SDK conformance

Shared test vectors under `vectors/` prove **identical APS-1 signing** across:

| SDK | Path |
|-----|------|
| TypeScript | `sdks/typescript` (`@salanor/aegis`) |
| Go | `sdks/go` (`github.com/salanor/salanor-go/aegis`) |
| Python | `sdks/python` (`salanor-aegis`) |

## Run locally

From monorepo root (requires Node 22, Go 1.22+, Python 3.10+):

```bash
pnpm sdk:conformance
```

## CI

Job `sdk-conformance` in `.github/workflows/ci.yml` runs the same checks on every PR.

## Adding vectors

1. Add a case to `vectors/signing-digest-v1.json` (or a new version file).
2. Compute `digest_hex` with `sdks/typescript` (`digestHex`) and commit the golden value.
3. Ensure Go and Python conformance tests read the JSON file.
