# Provenance: what Aegis proves about data, and what it does not

For a forensic reader: an auditor, an insurer's investigator, a regulator, or opposing counsel.
Read this before relying on an Aegis receipt as evidence.

## One sentence

Aegis proves **when** a record was made and that it has **not changed since**. It does **not** check
that the data inside the record is accurate. Each record says **who vouched for the data and how**, so
you can weigh it yourself.

## The adversaries we design against

| # | Adversary | What they want |
|---|-----------|----------------|
| A1 | Insider at the customer (officer, admin, DBA) | Change or delete a decision after the fact |
| A2 | Insider at Salanor | Rewrite history for a tenant |
| A3 | Compromised sending application | Send false data that looks authoritative |
| A4 | Anyone holding a stolen ingest key | Impersonate the sending system |
| A5 | Approver who later denies approving | Repudiate a decision |
| A6 | A reader who skims | Take a green mark as "the data is correct" |
| A7 | A party that replays or reorders old events | Make an old event look new, or hide a gap |

## What a receipt proves

- The receipt was written by Aegis at a stated time, and it has the signature of the Aegis receipt key.
  Changing any field, including the provenance block, breaks the hash and the signature.
- Receipts form a chain. Removing, reordering or inserting one is visible.
- Each receipt cites the sealed event(s) it was made from, by hash.
- A rule-and-policy version was applied (hash of the policy is in the receipt).
- If the source signed the event (grade G1): **that registered source key signed exactly these bytes**,
  within the key's validity window, with a sequence number that was not reused.
- If an approval is recorded: which authenticated approver was bound to the decision at that time.
- The provenance block as sealed: source, how it authenticated, the grade **at seal time**, which of
  five facts held, and a fixed plain-text limitations sentence.

## What a receipt does not prove

- **That the data is true.** A signed amount is the source's claim. A source that signs a wrong
  amount produces a validly signed wrong record, and the record shows who signed it.
- That a person or system **acted on** the decision. Only an execution match (G2) says the thing
  carried out is the thing approved.
- That the source system was **not compromised** when it signed (A3).
- That a G0 sender is who it says it is. An ingest key proves possession of a key, not identity.
- That nothing happened **outside** Aegis. Absence of a receipt is not proof of absence of an action.
- Legal admissibility. Time stamps come from a public RFC 3161 authority with no SLA.

## Evidence grades

A grade describes **how the data was vouched for**. It never describes whether the data is right.

| Grade | Meaning | Becomes true when |
|-------|---------|-------------------|
| **G0** | Sent with an ingest key. The sender did not sign the data. | Default for any event accepted without a source signature. All receipts sealed before Stage 2 are read as G0 (legacy). |
| **G1** | The source system signed the data with its own registered key. | The event arrives with a valid AEGIS-SRC1 envelope (Stage 1). |
| **G2** | Corroborated by another record: reconciled against a feed, or execution matched to approval. | A sealed grade-change record, with the feed named. |
| **G3** | Captured independently of the source. | A sealed grade-change record. |

Rules that hold in code:

1. The grade follows from five checks (`gradeFromChecks`), never the other way round.
   `source_signed` gives G1, `reconciled` or `execution_matched` gives G2, `independently_captured`
   gives G3. `approver_bound` alone does not raise the grade.
2. A receipt stores **`grade_at_seal`** inside its signature. It can never be edited.
3. A grade can **only rise**, by a new sealed receipt with outcome `grade_change`, which names the
   reason and the feed. `recordGradeChange` refuses a non-rise, a missing reason, a stale `from_grade`,
   and a grade the checks do not support (for example "G1" for a case nobody signed).
4. The **current** grade of a case is derived from the receipts (highest of the seal grade and the
   grade changes). `evidence_grade_change` is the queryable index of those receipts and is append-only.
   An offline verifier recomputes the grade from the bundle and needs no database.

## The five facts

Shown as a checklist on the case page, and in the PDF, bundle, share link and verify page.

| Fact | Plain meaning |
|------|---------------|
| `source_signed` | Signed by the source system with its own key |
| `approver_bound` | Approver identity bound to the decision |
| `execution_matched` | What was carried out matched what was approved |
| `reconciled` | Reconciled against another record |
| `independently_captured` | Captured independently of the source |

Per-field assertions record how each field got into the record: `asserted_by_source`,
`derived_by_aegis` (for example the approver fields), `corroborated`,
`independently_captured`, or `signed_by_third_party` (Stage 7 bureau / third-party
signature verified against a registered `kind=third_party` key). Fields without a
third-party signature remain `asserted_by_source`.

## What is inside the signed receipt

Top-level field `provenance` (included in the canonical JSON that the signature covers):

```json
{
  "schema_version": 1,
  "source_id": "src_core",
  "source_name": "Demo Core Banking",
  "source_key_id": "k_core_2026_01",
  "authentication": "source_signature",
  "evidence_grade": "G1",
  "grade_at_seal": "G1",
  "field_assertions": { "amount": "asserted_by_source", "approver": "derived_by_aegis" },
  "checks": {
    "source_signed": true, "approver_bound": false, "execution_matched": false,
    "reconciled": false, "independently_captured": false
  },
  "limitations": "Aegis proves when this record was made and that it has not changed since. It does not check that the data is accurate. Fields marked as asserted by the source are the source's own claim.",
  "recorded_at": "2026-03-01T10:00:01.000Z"
}
```

`authentication` is `bearer_key`, `source_signature` or `mtls`. In this release the first two are
produced. `mtls` is accepted in the schema and worded correctly (the connection was authenticated; the
source did not sign the data itself) but nothing emits it yet.

A receipt with **no** `provenance` field is **legacy**. It still verifies. It reads as G0 (legacy), or G1
(legacy) if it carries a valid Stage 1 source envelope. The wording says the source was not labelled at
the time.

## How the verifier checks it

`verifyForensicBundle` adds two finding codes:

- `provenance_invalid`: a block that is present but malformed; `evidence_grade` differs from
  `grade_at_seal`; the grade does not follow from the checks; `source_signed` without a source
  signature; a claimed source signature with no envelope; an envelope for a different source or key.
- `grade_change_invalid`: a change that does not raise the grade, has no reason, or does not start from
  the grade the case had reached before it.

`verifyBundleFile` also recomputes the per-receipt and case-level provenance from the signed receipts and
reports `summary_mismatch` if the unsigned summary in the file says anything else. Raising the grade in
the JSON by hand is caught.

## How it is worded on screen

Two separate lines, never one green mark:

- **Record intact: signed and unchanged since \<time\>** (about the record)
- **Source of the data: \<grade and plain wording\>** (about where the data came from)

Example headline: "Data signed by Demo Core Banking (key k_core_2026_01). Aegis proves it was recorded at
2026-03-01 10:00 UTC and has not changed since. Aegis does not check that the data is accurate. (grade G1)."

The word "Verified" is not used next to data content. `scripts/check-no-bare-verified.mjs` scans the
console and the export templates; `pnpm check:wording` and the web-console build fail on a standalone use.
The allowlist (account email state, audit-log action labels, a phone callback, an RFC 3161 token check)
is in the script with a reason for each entry.

## Where it shows

Case page ("Where this data came from", with a Technical details toggle), Approvals card, Verify page
(event and bundle), evidence bundle (JSON, offline check), evidence PDF, case summary API, share link,
Risk Approval Pack ("Where the data came from": counts by grade, legacy cases, cases raised later).

## Attack to control

| Attack | Control | Where | What remains |
|--------|---------|-------|--------------|
| A1 edits a receipt, including its grade or limitations | Hash and signature cover the whole body including `provenance` | `receipt.ts`, `verify-bundle.ts` | Nothing: any edit is detected |
| A1 deletes or reorders receipts | Hash chain, per-org sequence, checkpoints | `verify-bundle.ts` | Needs the receipts or a checkpoint to compare |
| A1 raises the grade in an exported file | `summary_mismatch`: grade recomputed from signed receipts | `evidence-bundle.ts` | Nothing |
| A1/A2 forges a `grade_change` to look better | Must be a signed receipt, must raise from the prior grade, must cite sealed events, checks must support the grade | `verify-bundle.ts`, `recordGradeChange` | A forged change needs the Aegis receipt key (see A2) |
| A2 rewrites history | Append-only triggers, receipt key in KMS (when live), witness checkpoints and public log | `docs/APPEND_ONLY.md` | Interim software key is weaker than KMS (`docs/DEMO.md`, key custody) |
| A3 sends false data from a compromised source | **Not prevented.** The record shows who signed it and how (G1) and that the data is the source's claim | provenance block | Corroboration (G2) or independent capture (G3) is the answer; Stage 2 only labels it |
| A4 uses a stolen ingest key | Source signature (G1) needs the source's private key, which is separate. Orgs can require signed events | Stage 1 `require_signed_events` | Unsigned orgs remain G0, and the record says so |
| A5 repudiates an approval | `approver_bound`, sealed `approver_binding` + `approved_view_hash` on outcome receipts | `issue-approval-outcome.ts`, Stage 5 | WebAuthn step-up not yet verified (Partial); binding is session/account today |
| A6 reads "intact" as "correct" | Two lines; fixed limitations sentence in every export; wording scan fails the build | `provenance.ts`, `check-no-bare-verified.mjs` | A reader can still ignore the text |
| A7 replays or hides a gap | Stage 1 seq, nonce, clock window, recorded gaps | `src/sources/` | Documented in `SIGNING.md` |
| Legacy receipt passed off as higher grade | Missing block reads as G0 (legacy); never silently upgraded | `buildCaseProvenance` | Legacy G1 only when a valid Stage 1 envelope is attached |

## Stages

| Stage | What | Status |
|-------|------|--------|
| 1 | Source-signed events (G1): envelope, registry, keys, sequence, offline verify | Done |
| 2 | Honest labelling: provenance block, grade at seal, grade changes, wording, exports | Done (see `provenance/STAGE_2_REPORT.md` for partials) |
| 3 | Decision token + executor confirm | Done (see `provenance/STAGE_3_REPORT.md`) |
| 4 | Reconciliation + exceptions | Done (see `provenance/STAGE_4_REPORT.md`) |
| 5 | Approver binding (view hash + authenticated identity) | Done, WebAuthn Partial (see `provenance/STAGE_5_REPORT.md`) |
| 6 | Independent capture / PG collector (G3) | Partial (see `provenance/STAGE_6_REPORT.md`) |
| 7 | Third-party signed facts, input commitments, plausibility | Done, with Partials (see `provenance/STAGE_7_REPORT.md`) |
| 8 | Red Team suite + multi-system bank test environment | Done, with Partials (see `provenance/STAGE_8_REPORT.md`) |
| 9 | Documentation and demo ("Lying to Aegis", assurance ladder, honest claims) | Done, with Partials (see `provenance/STAGE_9_REPORT.md`) |

Related: [SIGNING.md](./provenance/SIGNING.md), [INTEGRATION.md](./provenance/INTEGRATION.md),
[EXECUTOR.md](./provenance/EXECUTOR.md), [RECONCILIATION.md](./provenance/RECONCILIATION.md),
[COLLECTOR.md](./provenance/COLLECTOR.md), [ASSURANCE_LADDER.md](./provenance/ASSURANCE_LADDER.md),
[CUSTOMER_ASSERTED_DATA.md](./provenance/CUSTOMER_ASSERTED_DATA.md),
[FINAL_STATUS.md](./provenance/FINAL_STATUS.md),
[STAGE_1_REPORT.md](./provenance/STAGE_1_REPORT.md) … [STAGE_9_REPORT.md](./provenance/STAGE_9_REPORT.md).
