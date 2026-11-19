# Stage 2 report: honest labelling (provenance block)

Branch `feature/provenance`. `spec/` untouched.
Status: **Done, with the Partials listed below.**

Re-check after Stage 1 close-out (2026-11-19): `provenance.test.ts` 12/12,
`provenance.integration.test.ts` 3/3, `no-bare-verified.test.ts` 2/2. Stamped-time
wording kept as `Trusted time: …` (aligned with main / `trusted-time.test.ts`).

## What Stage 2 delivers

Every receipt now says where its data came from, inside its own signature. Screens and exports show two
separate lines instead of one green "Verified":

- **Record intact: signed and unchanged since \<time\>**
- **Source of the data: \<grade and plain wording\>**

Aegis proves when a record was made and that it has not changed. It does not check that the data is
accurate. Full reader guide: [`docs/PROVENANCE.md`](../PROVENANCE.md).

| # | Requirement | Where |
| --- | --- | --- |
| 1 | `provenance` block in the signed receipt payload (source, authentication, grade, per-field assertions, five checks, fixed limitations, `recorded_at`) | `src/sources/provenance.ts`, `src/forensic/receipt.ts`, `src/forensic/issue.ts`, `src/bank/handle-event.ts`, `src/forensic/issue-approval-outcome.ts` |
| 1 | Old receipts without the block verify and read as G0 legacy (G1 legacy if a Stage 1 envelope is attached) | `buildCaseProvenance`, `summarizeReceiptProvenance` |
| 2 | `grade_at_seal` in the receipt; current grade derived from sealed grade changes; both in the bundle | `provenance.ts`, `evidence-bundle.ts` |
| 2 | Table `evidence_grade_change` (append-only), receipts with outcome `grade_change`, helper `recordGradeChange` | `migrations/007_evidence_grade_change.sql`, `src/forensic/case-provenance.ts` |
| 2 | Case API shows current grade even when only the seal-time G0/G1 exists | `src/routes/console/cases.ts` (`CaseSummary.provenance`) |
| 3 | Provenance on case page, Approvals card, Verify page (event and bundle), evidence bundle, PDF, case summary, share link, Risk Approval Pack | see "Files changed" |
| 4 | "Can the record be trusted?" and green "Verified" replaced by the two lines | `case-story.ts`, `case-four-answers.tsx`, trace page, verify pages, share page |
| 5 | Docs | `docs/PROVENANCE.md`, `docs/DEMO.md` ("Must not claim"), this report |
| 6 | Tests, including a build-failing wording scan | `test/provenance*.test.ts`, `test/no-bare-verified.test.ts`, `scripts/check-no-bare-verified.mjs` |

## Choices (where the brief left room)

1. **Receipts are the source of truth for grades.** The case's current grade is computed from its signed
   receipts (seal grade, then grade changes). `evidence_grade_change` is an index over them, so an offline
   bundle can recompute and check the grade with no database.
2. **A grade change is a real forensic receipt** (`outcome = grade_change`) that cites the case's last
   data receipt's sealed events and carries `{from_grade, to_grade, reason, feed_name, checks}`. The
   verifier refuses a change that does not raise the grade, lacks a reason, or does not start from the
   grade the case was at.
3. **The grade follows the checks.** `recordGradeChange` and the verifier both refuse a grade the checks
   do not support (for example G1 for a case nobody signed).
4. **Approval outcome receipts** carry a block built from the case's receipts so far, with
   `approver_bound: true` and the approver fields marked `derived_by_aegis`.
5. **The unsigned summary in a bundle is checked, not trusted.** `verifyBundleFile` recomputes provenance
   from the signed receipts and reports `summary_mismatch` on any difference.
6. **The verify checklist gets one new row, `source_of_data`, with status `info`.** It is never a pass mark.
7. **Wording scan scope:** string literals and JSX text in `apps/web-console/src` and the export
   templates in `services/aegis-api/src/{forensic,compliance,routes/public,routes/console}`. Comments,
   identifiers (`email_verified`, `receipt.verified`) and tests are skipped. The allowlist has six
   entries, each with a reason (account email, audit-log action label, phone callback, RFC 3161 token).

## Test results (2026-11-18, local Postgres on :5435)

| Command | Result |
| --- | --- |
| `pnpm --filter aegis-api test test/provenance.test.ts` | **12 / 12 passed** |
| `pnpm --filter aegis-api test test/provenance.integration.test.ts` | **3 / 3 passed** (DB) |
| `pnpm --filter aegis-api test test/no-bare-verified.test.ts` | **4 / 4 passed** |
| Targeted set (11 files: the three above plus `evidence-bundle`, `forensic-receipt`, `forensic-source-envelope`, `source-envelope`, `approval-outcome-receipt`, `risk-approval-pack`, `bank-ready-pass2`, `tenant-wipe-coverage.integration`) | **114 / 114 passed** |
| `AEGIS_ALLOW_DESTRUCTIVE_MIGRATE_TEST=1` `test/migrate.integration.test.ts` + `test/tenant-wipe-coverage.integration.test.ts` | **6 / 6 passed** (007 applies from scratch; new table is in the wipe list) |
| `pnpm --filter aegis-api test` (full suite) | **484 passed, 1 failed, 1 skipped** (see Pre-existing failure) |
| `pnpm --filter aegis-api typecheck` | **clean** |
| `pnpm --filter @salanor/web-console typecheck` | **clean** |
| `node scripts/check-no-bare-verified.mjs` | **passed, 194 files scanned** |
| `node conformance/run.mjs` (Stage 1, regression) | **all legs passed** |

### Raw output

Provenance and wording tests (first run of the new files together):

```
 RUN  v3.2.4 D:/PROJECTS/salanor/services/aegis-api

 ✓ test/provenance.test.ts (12 tests) 213ms
 ✓ test/provenance.integration.test.ts (3 tests) 916ms
 ✓ test/no-bare-verified.test.ts (4 tests) 281ms

 Test Files  3 passed (3)
      Tests  19 passed (19)
```

What `test/provenance.test.ts` covers (12 tests, all passed):

```
 ✓ provenance block is part of the signed receipt > is included in the signed payload and the bundle verifies
 ✓ provenance block is part of the signed receipt > editing any part of the block breaks verification
 ✓ provenance block is part of the signed receipt > flags a re-signed block whose grade does not follow from its checks
 ✓ provenance block is part of the signed receipt > flags a claimed source signature that has no signed envelope behind it
 ✓ legacy receipts (no provenance block) > verify, and read as G0 legacy
 ✓ legacy receipts (no provenance block) > a legacy evidence bundle file verifies and states G0 legacy
 ✓ legacy receipts (no provenance block) > a Stage 1 signed-envelope receipt without a block reads as G1 legacy
 ✓ grade changes > raise the current grade while the grade at seal stays as sealed
 ✓ grade changes > shows the current grade for a case that only has its seal-time grade
 ✓ grade changes > rejects a change that does not raise the grade, or starts from the wrong grade
 ✓ grade changes > gradeFromChecks follows the checks, never the reverse
 ✓ provenance in the evidence bundle and PDF > is in the bundle, the PDF, and a tampered summary is caught
```

"Editing the block breaks verification" edits seven things in turn (grade, source name, authentication,
a check flag, the limitations text, `recorded_at`, a field assertion) and removes the block once. Each
one gives `receipt_hash_mismatch` (removal gives `ok: false`).

Targeted set:

```
 ✓ test/source-envelope.test.ts (41 tests) 6371ms
 ✓ test/provenance.integration.test.ts (3 tests) 559ms
 ✓ test/forensic-receipt.test.ts (2 tests) 232ms
 ✓ test/evidence-bundle.test.ts (13 tests) 219ms
 ✓ test/no-bare-verified.test.ts (4 tests) 194ms
 ✓ test/provenance.test.ts (12 tests) 188ms
 ✓ test/approval-outcome-receipt.test.ts (5 tests) 113ms
 ✓ test/bank-ready-pass2.test.ts (26 tests) 113ms
 ✓ test/forensic-source-envelope.test.ts (1 test) 110ms
 ✓ test/tenant-wipe-coverage.integration.test.ts (5 tests) 89ms
 ✓ test/risk-approval-pack.test.ts (2 tests) 36ms

 Test Files  11 passed (11)
      Tests  114 passed (114)
```

Migration (destructive test, run on the dedicated `aegis_test` database):

```
Applied migration 006_sources
Applied migration 007_evidence_grade_change
 ✓ test/migrate.integration.test.ts (1 test) 1589ms
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

Full suite after the last change:

```
 Test Files  1 failed | 94 passed | 1 skipped (96)
      Tests  1 failed | 484 passed | 1 skipped (486)
```

Wording scan on the current tree, and on the old share page from `HEAD` (proves the scan catches the old wording):

```
$ node scripts/check-no-bare-verified.mjs
Wording check passed: 194 files scanned, no standalone "verified" next to data.

$ (scan of HEAD:apps/web-console/src/app/share/[token]/page.tsx)
[
 { "file": "HEAD:share/[token]/page.tsx", "line": 155, "text": "Verified" },
 { "file": "HEAD:share/[token]/page.tsx", "line": 242, "text": "Witness and transparency verified" }
]
```

Case summary API (integration test, real HTTP route through `consoleRoutes`): a Stage 2 case reads
`grade_at_seal: G0, current_grade: G0` before any change and `G0` then `G2` after `recordGradeChange`; a
case sealed without a block reads `legacy: true` and "G0 (legacy)".

### Pre-existing failure (not caused by Stage 2)

```
 FAIL  test/trusted-time.test.ts > Verify shows trusted time (amber while pending, never green) > stamped: 'Trusted time: <authority> at <UTC>' and pass
AssertionError: expected 'Timestamped by Sectigo at 2026-11-16 …' to be 'Trusted time: Sectigo at 2026-11-16 0…'
```

`HEAD` already has the label "Timestamped by …" in `evidence-bundle.ts` and `verify-messages.ts` while the
test at `HEAD` expects "Trusted time: …". Stage 2 did not touch those lines. Left as it was.

One existing test **was** updated on purpose: `test/bank-ready-pass2.test.ts` lists the verify checks in
order and now expects the new `source_of_data` row (status `info`) at the end.

## Files changed

Backend (`services/aegis-api`):

- New: `src/sources/provenance.ts`, `src/forensic/case-provenance.ts`, `migrations/007_evidence_grade_change.sql`
- Changed: `src/db/migrate.ts`, `src/sources/grade.ts`, `src/forensic/receipt.ts`, `src/forensic/issue.ts`,
  `src/forensic/issue-approval-outcome.ts`, `src/forensic/verify-bundle.ts`, `src/forensic/verify-messages.ts`,
  `src/forensic/evidence-bundle.ts` (bundle, verify, PDF), `src/bank/handle-event.ts`,
  `src/routes/bank-events.ts`, `src/routes/bank-batch.ts`, `src/routes/source-events.ts`,
  `src/routes/console/cases.ts`, `src/routes/public/index.ts` (share and public verify),
  `src/compliance/risk-approval-pack.ts`

Web console (`apps/web-console`):

- New: `src/components/console/provenance-panel.tsx`
- Changed: `src/lib/types.ts`, `src/lib/case-story.ts`, `src/components/console/case-four-answers.tsx`,
  `src/app/aegis/traces/[traceId]/page.tsx`, `src/app/aegis/approvals/page.tsx`,
  `src/app/aegis/events/[eventId]/page.tsx`, `src/app/aegis/integrations/page.tsx`,
  `src/app/verify/page.tsx`, `src/app/verify/bundle-verifier.tsx`, `src/app/verify/verify.module.css`,
  `src/app/share/[token]/page.tsx`, `package.json` (build runs the wording scan)

Wording guard and repo: `scripts/check-no-bare-verified.mjs` (new), root `package.json` (`check:wording`)

Tests: new `test/provenance.test.ts`, `test/provenance.integration.test.ts`, `test/no-bare-verified.test.ts`;
changed `test/risk-approval-pack.test.ts`, `test/bank-ready-pass2.test.ts`, `test/integration-fixture.ts`

Docs: `docs/PROVENANCE.md` (new), `docs/DEMO.md` ("Must not claim"), this report

## Partials and known limits

1. **Nothing raises a grade automatically.** `execution_matched`, `reconciled` and
   `independently_captured` are never set by ingest. A case reaches G2 or G3 only through
   `recordGradeChange`, which is a helper. There is no HTTP endpoint or console button for it, and no feed
   calls it. The demo therefore shows G0 and G1 only.
2. **`mtls` is in the schema and the wording but nothing emits it.**
3. **Seed and demo tools still post unsigned events**, so seeded cases read G0.
4. **Compliance CSV exports are not labelled.** The Risk Approval Pack (JSON and PDF), the evidence bundle
   and the evidence PDF are.
5. **The case summary API loads each case's receipts** (trimmed bodies, up to 100 cases per call). Fine at
   demo scale. A materialised current-grade column would be the next step if lists get large.
6. **The wording scan is a heuristic over string literals and JSX text.** It covers the console and the
   export templates named above, not the marketing site, the SDKs or the docs. A string assembled from
   pieces could slip past it.
7. **The web console changes are type-checked, not looked at in a browser.** No screenshots were taken.
8. **Approval outcome receipts** mark `approver_bound` at case level (merged with the case's earlier
   receipts), not per approver.
9. **Pre-existing `trusted-time` test failure** (above) is left alone.
