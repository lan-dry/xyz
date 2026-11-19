# Stage 1 report: signed source events (G1)

Branch `feature/provenance`. Status: **Done** with noted Partials below. `spec/` untouched.
A1–A5 / B1–B7 already on `main` (PR #7); in-path permit committed first on this branch.

## What Stage 1 delivers

An event can arrive with a signature from a **registered source system**. Aegis checks the signature,
the key, the clock, the sequence number and the nonce, then seals the event. A sealed event carries
`evidence_grade: "G1"` and the envelope, so offline verify can re-check the source signature.

| Area | What | Where |
| --- | --- | --- |
| Signing library | AEGIS-SRC1 envelope, JCS, Ed25519 | `packages/aegis-sdk` |
| Sending agent | Durable outbox, ordered, crash-safe | `packages/aegis-connector` |
| Source registry | Sources, keys, rotation, revocation, history | migration `006_sources.sql`, `src/sources/` |
| Verification | Ordered checks, per-source advisory lock | `src/sources/verify-and-accept.ts` |
| Ingest | `POST /v1/aegis/source-events` (+ envelope on `/governed/events`) | `src/routes/source-events.ts` |
| Enforcement | `organization.require_signed_events` (on for demo orgs) | bank-events, platform-auth |
| Console | Admin Sources page + API | `apps/web-console/.../sources`, console routes |
| Offline verify | Bundle + CLI check source envelopes | `verify-bundle.ts`, `aegis-verify` |
| Independent check | Python verifier | `tools/independent-verify` |
| Conformance | 15 positive + 12 negative vectors | `conformance/vectors.json` |
| Docs | Algorithm, integration | `SIGNING.md`, `INTEGRATION.md` |

## Choices (where the brief left room)

1. **New package `@salanor/aegis-sdk`** under `packages/` for AEGIS-SRC1 only — does not weaken APS-1 in `sdks/typescript` (`@salanor/aegis`).
2. **Sequence gaps:** accept `seq > last+1` with a recorded gap; accept a later arrival that fills a recorded gap (needed for parallel senders). True replay (`seq` already accepted) still 409.
3. **Connector 409:** only 2xx marks delivered (Aegis returns 200 for idempotent duplicates).

## Test results (corrections re-run 2026-11-19)

| Command | Result |
| --- | --- |
| `pnpm --filter @salanor/aegis-sdk test` | **55 / 55 passed** |
| `pnpm --filter @salanor/aegis-connector test` | **24 passed, 1 skipped** |
| `node conformance/run.mjs` | **all legs passed** (TS + Python; vectors also in `sdks/conformance/vectors/aegis-src1-v1.json`) |
| `pnpm --filter aegis-api exec vitest run test/source-envelope.test.ts test/require-signed-events-setting.test.ts` | **45 passed** (incl. idem equality + two-person setting) |
| `pnpm --filter aegis-api exec vitest run test/forensic-source-envelope.test.ts` | **1 / 1 passed** (redacted body still verifies) |
| `py -3 tools/independent-verify/verify_envelope.py --vectors conformance/vectors.json` | **OK** |
| `pnpm --filter aegis-api typecheck` | **clean** |

### Raw output

```
 ✓ test/source-envelope.test.ts (41 tests) 5980ms
   ✓ ... 50 parallel ingests ... contiguous accounting  2463ms
 ✓ test/forensic-source-envelope.test.ts (1 test) 100ms
 Test Files  2 passed (2)
 Tests  42 passed (42)

> @salanor/aegis-sdk@0.1.0 test
 ✓ test/jcs.test.ts (4 tests)
 ✓ test/send.test.ts (2 tests)
 ✓ test/envelope.test.ts (12 tests)
 ✓ test/conformance.test.ts (28 tests)
 Test Files  4 passed (4)
 Tests  46 passed (46)

> @salanor/aegis-connector@0.1.0 test
 ✓ test/keystore.test.ts (5 tests | 1 skipped)
 ✓ test/durability.test.ts (8 tests)
 ✓ test/connector.test.ts (12 tests)
 Tests  24 passed | 1 skipped (25)

vectors.json is up to date
[typescript] 15 positive + 12 negative vectors OK
[python] 15 positive + 12 negative vectors OK
conformance: all legs passed

[python] 15 positive + 12 negative vectors OK
```

### Requirement → test map

| Requirement | Coverage |
| --- | --- |
| Valid → G1 | source-envelope.test |
| Forged / wrong / unknown / revoked / expired / not-yet-valid key | source-envelope.test |
| Replay / lower seq / nonce reuse / ts skew / idempotency | source-envelope.test |
| Sequence gap flagged | source-envelope.test |
| Unsigned rejected when required | source-envelope.test |
| Parallel 50 contiguous | source-envelope.test |
| Connector restart / offline then online | connector durability + connector.test |
| Conformance TS + Connector path + Python | conformance/run.mjs + SDK + independent-verify |
| Tampered stored envelope breaks verify | forensic-source-envelope.test |

## Partial / follow-ups

| Item | Status |
| --- | --- |
| `tools/demo` / bank-simulator still post **unsigned** HTTP events | **Partial** — provision sets `require_signed_events=true` explicitly (two-person to turn off). Unsigned demos 400 until Connector wiring (Stage 4), or disable via two-admin confirm / register a source and sign. |
| PKCS#11/KMS private key interface in Connector | **Partial** — interface/docs stub only; encrypted file for dev/tests |
| Console “disable source” action | **Partial** — registry supports it; UI revoke-all-keys works |
| OpenAPI for `/source-events` | **Not done** |
| Full aegis-api suite `trusted-time` label mismatch | Pre-existing, unrelated |

## Corrections (exploration approved)

| # | Correction | Where |
| --- | --- | --- |
| 1 | Signature covers envelope with `event` replaced by `event_hash`; full body checked only when stored | `@salanor/aegis-sdk` `signingPayload` / `verifyEnvelope`; Python verifier; `SIGNING.md` |
| 2 | Domain `AEGIS-SRC1` + RFC 8785 `canonicalize` only (not APS1 / receipt sorter) | unchanged prefix; docs clarified |
| 3 | `require_signed_events` dedicated column; changes sealed; two-person to turn **off**; Demo provision sets explicitly; `require_signed_events_in_force` on each event | `006_sources.sql`, `org/require-signed-events.ts`, provision, handle-event |
| 4 | `envelope.idempotency_key` == `event.idempotency_key` before evaluation on governed/bank/source-events | `verify-and-accept.ts` + SDK |
| 5 | New vectors file (do not touch `spec/`) | `sdks/conformance/vectors/aegis-src1-v1.json` (+ `conformance/vectors.json`) |
| 6 | Migration 006 covered by upgrade/migrate test | `migrate.integration.test.ts` asserts source tables + column + `006_sources` |

## Honesty line

Stage 1 proves **attributability** of the source system (G1). It does **not** prove content was true — that needs G2/G3 (Stages 3–6).
