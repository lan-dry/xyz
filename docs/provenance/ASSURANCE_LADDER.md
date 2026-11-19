# Assurance ladder (G0–G3 now, roadmap above)

A grade describes **how the data was vouched for**. It never describes whether the data
is right. Full reader guide: [PROVENANCE.md](../PROVENANCE.md).

## Built today (G0–G3)

| Grade | Meaning | How it becomes true | What it closes | What it does not |
|-------|---------|---------------------|----------------|------------------|
| **G0** | Sent with an ingest key. The sender did not sign the data. | Default when no source signature is accepted. Legacy receipts without a provenance block read as G0 (legacy). | Labels "anyone with the ingest key could have sent this". | Identity of the source system; content accuracy. |
| **G1** | The source system signed the data with its own registered key. | Valid AEGIS-SRC1 envelope (Stage 1). | Attribution: which registered key signed these bytes; replay/gap visibility. | Content accuracy; that the source was not compromised. |
| **G2** | Corroborated by another record. | Sealed `grade_change`: reconciled feed match and/or execution matched to the decision token (Stages 3–4). | "Approved X, paid Y" and "ledger disagrees with receipt" classes of lie. | Independent observation of the ledger (that is G3). |
| **G3** | Captured independently of the source. | Sealed `grade_change` with `independently_captured` (Stage 6 collector / gateway tap). | Direct ledger edits with no application event (`db_change_without_event`); value hash mismatch (`db_value_mismatch`). | Live pgoutput on bank-core is **Done** — see [STAGE_6_REPORT.md](./STAGE_6_REPORT.md). Do not claim G3 from triggers. |

Rules that hold in code: the grade follows from five checks; `grade_at_seal` is inside the
receipt signature; a grade can only rise via a sealed `grade_change`; offline verify
recomputes the grade from the bundle.

## Roadmap (not built)

Each item is labelled **not built**. None of these are implied by a green seal check or
by grades G0–G3 today.

| Roadmap item | Attack it would close | Status |
|--------------|----------------------|--------|
| **Hardware-backed / HSM keys** for Aegis receipt and decision-token signing (and optionally customer source keys in HSM) | A2 (Salanor insider) or host compromise exporting the software signing key and rewriting or forging seals | **Not built.** Interim software key is named on Verify / receipts when active; KMS Sign is the nearer plan (`docs/DEMO.md`, `docs/KEY_CUSTODY.md`). |
| **Approver device signatures** (WebAuthn / platform authenticator bound into `approver_binding`) | A5 (approver repudiation) and session theft approving without the human's device | **Not built.** Stage 5 binds authenticated account/session; `webauthn_assertion` is always null today ([STAGE_5_REPORT.md](./STAGE_5_REPORT.md)). |
| **Counterparty or regulator co-signing of witness roots** | A2 rewriting history that a single operator-controlled witness could also rewrite; disputes over whose checkpoint is authoritative | **Not built.** Current witness / transparency path is Salanor-operated; public log inclusion is not a multi-party co-sign. |
| **Independent monitors** (third-party watchers that continuously verify chains, grades, and feed gaps and raise out-of-band alerts) | Silent degradation, missed `source_silent`, or Aegis/console compromise that hides exceptions from operators | **Not built.** Exceptions and reconciliation run inside the product; no external monitor product. |
| **Trusted execution environments (TEE)** for policy evaluation or seal path | Host-level tampering with the decision engine or seal process while keys remain available to the host | **Not built.** No TEE attestation claim. |

## How to talk about the ladder

- Say the grade and the plain limitations sentence. Never say "verified" for content accuracy.
- Say "roadmap / not built" for every row in the roadmap table.
- G2 and G3 require sealed grade-change receipts. Labelling a story "target G2" is not the
  same as a live rise unless confirm + reconcile (or collector match) actually ran.

Related: [SIGNING.md](./SIGNING.md), [EXECUTOR.md](./EXECUTOR.md),
[RECONCILIATION.md](./RECONCILIATION.md), [COLLECTOR.md](./COLLECTOR.md).
