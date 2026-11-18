# Stage 7 report: Third-party signed facts, input commitments, plausibility

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched.
Status: **Done, with the Partials listed below.**

## Verdict

Signed third-party facts (bureau stub → LOS forward → verify against `kind=third_party`),
input commitments (hashes bound into the evidence bundle + supplied-doc check), and
non-blocking plausibility flags are implemented and tested. Optional encrypted document
copy storage remains **off by default** (stub only).

## What Stage 7 delivers

| # | Requirement | Where | Status |
| --- | --- | --- | --- |
| 1 | Bureau stub signs responses; LOS forwards; Aegis verifies; policy uses signed values; `fact_mismatch` when LOS differs; case line "Credit score 612, signed by Demo Credit Bureau"; other fields stay `asserted_by_source` | `tools/demo-bureau/**`, `sources/third-party-facts.ts`, `bank/handle-event.ts`, `provenance.ts` (`signed_by_third_party`), Exceptions catalog, console provenance panel | **Done** |
| 2 | Input commitments (SHA-256); bundle binds hashes; verifier accepts supplied docs; encrypted copy storage off by default | `sources/input-commitments.ts`, `forensic/evidence-bundle.ts`, migration `011_stage7_facts` | **Done** (durable blob store Partial) |
| 3 | Plausibility flags (outlier, off-hours, schema drift, volume); case + Exceptions; never change outcome | `reconciliation/plausibility.ts`, Exceptions `plausibility_flag`, case provenance panel | **Done** |
| 4 | Tests for each | `test/third-party-facts.test.ts`, `test/input-commitments.test.ts`, `test/plausibility.test.ts`, `tools/demo-bureau/test` | **Done** |
| 5 | This report | `docs/provenance/STAGE_7_REPORT.md` | **Done** |

## Choices

1. **Nested AEGIS-SRC1 envelopes** from a registered `kind=third_party` source are verified
   cryptographically + against key validity. Nested verify does **not** advance the bureau
   sequence (the envelope is evidence forwarded by the LOS, not a primary ingest).
2. **Attribute shapes accepted:** `third_party_facts[]`, `signed_facts[]`, or
   `bureau_response` / `bureau_response.envelope`. Fact fields come from `event.fields` or
   well-known keys (`credit_score`, …).
3. **On mismatch**, Aegis raises `fact_mismatch`, overwrites the LOS value with the signed
   value for evaluation and sealing, and marks the field `signed_by_third_party`.
4. **Input commitments** live on receipt attributes and are copied into
   `bundle.input_commitments`. `verifyBundleFile({ suppliedDocuments })` checks them.
   `AEGIS_STORE_INPUT_COPIES=1` + `AEGIS_INPUT_COPY_KEY_B64` enable an in-memory AES-GCM
   stub; no durable object store yet.
5. **Plausibility** runs at ingest after evaluation. Flags are sealed on the receipt and
   raised as Exceptions with `detail.non_blocking: true`. They never rewrite `outcome`.

## Test results (2026-11-19, local)

| Command | Result |
| --- | --- |
| `pnpm --filter @salanor/demo-bureau test` | **1 / 1 passed** |
| `pnpm --filter aegis-api test test/third-party-facts.test.ts test/input-commitments.test.ts test/plausibility.test.ts` | **17 / 17 passed** |
| Regression: `provenance.test.ts` + `reconciliation.test.ts` | **27 / 27 passed** |
| `pnpm --filter aegis-api typecheck` | **clean** |
| `pnpm --filter @salanor/web-console typecheck` | **clean** |

### Raw output (demo-bureau)

```
 TAP version 13
 # Subtest: bureau signs a credit score envelope verifiable with its public key
 ok 1 - bureau signs a credit score envelope verifiable with its public key
 1..1
 # tests 1
 # pass 1
 # fail 0
```

### Raw output (aegis-api Stage 7)

```
 RUN  v3.2.4 D:/PROJECTS/salanor/services/aegis-api

 ✓ test/third-party-facts.test.ts (7 tests) 382ms
 ✓ test/input-commitments.test.ts (4 tests) 25ms
 ✓ test/plausibility.test.ts (6 tests) 181ms

 Test Files  3 passed (3)
      Tests  17 passed (17)
```

Coverage highlights:

```
 ✓ formats the case-page credit score line
 ✓ policy evaluates the signed score, not the LOS assertion
 ✓ verifies a nested bureau envelope and uses the signed value
 ✓ LOS score differs from signed bureau → fact_mismatch; signed value used
 ✓ rejects a nested envelope from a non-third_party source kind
 ✓ parses / verifies / binds input commitments; storage off by default
 ✓ amount outlier / off-hours / schema drift / sudden volume
 ✓ raises non-blocking plausibility_flag exceptions without changing outcome
```

## Files

Bureau stub:
- `tools/demo-bureau/**` (sign, HTTP stub, test, README)

API:
- New: `src/sources/third-party-facts.ts`, `src/sources/input-commitments.ts`,
  `src/reconciliation/plausibility.ts`, `migrations/011_stage7_facts.sql`,
  `test/third-party-facts.test.ts`, `test/input-commitments.test.ts`,
  `test/plausibility.test.ts`
- Changed: `bank/handle-event.ts`, `sources/provenance.ts`,
  `reconciliation/types.ts`, `exception-catalog.ts`, `index.ts`,
  `forensic/evidence-bundle.ts`, `db/migrate.ts`, `test/integration-fixture.ts`

Console:
- `components/console/provenance-panel.tsx`, `lib/types.ts`

Docs:
- `docs/provenance/STAGE_7_REPORT.md` (this file)
- Updates: `docs/PROVENANCE.md`, `docs/provenance/RECONCILIATION.md`

## Partials / how to finish

1. **Durable encrypted copies** — `input_commitment_copy` table exists; wire a blob/KMS
   store and a console download path when a tenant opts in.
2. **Bureau sequence / idempotency** — nested verify skips seq bookkeeping by design;
   if the bureau also primary-ingests the same envelopes, decide whether to share
   nonce/seq tables.
3. **Plausibility thresholds** — fixed defaults (z≥3, UTC 07–18 weekdays, 5× volume).
   Make per-source config when a pilot needs it.
4. **Verify UI** — API accepts `suppliedDocuments` on `verifyBundleFile`; the Verify page
   file-picker for documents is not wired yet.
