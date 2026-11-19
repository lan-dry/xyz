# SDK conformance

Shared test vectors under `vectors/`.

## APS-1 event signing

Proves **identical APS-1 signing** across:

| SDK | Path |
|-----|------|
| TypeScript | `sdks/typescript` (`@salanor/aegis`) |
| Go | `sdks/go` (`github.com/salanor/salanor-go/aegis`) |
| Python | `sdks/python` (`salanor-aegis`) |

Vector file: `vectors/signing-digest-v1.json`.

## AEGIS-SRC1 source envelopes (provenance Stage 1)

Separate from APS-1. Domain prefix `AEGIS-SRC1`; signature covers the envelope with
`event` replaced by `event_hash` (RFC 8785 via `canonicalize`). Regenerated from
`conformance/generate-vectors.mjs` into both `conformance/vectors.json` and
`vectors/aegis-src1-v1.json`.

```bash
pnpm --filter @salanor/aegis-sdk build
node conformance/generate-vectors.mjs
node conformance/run.mjs   # TypeScript SDK + independent Python
```

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
