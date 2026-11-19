# Provenance build — final status (Stages 1–9)

Branch `feature/provenance`. Honest summary only. Detail and Partials live in each
`STAGE_<n>_REPORT.md`. Reader guide: [PROVENANCE.md](../PROVENANCE.md).
Ladder: [ASSURANCE_LADDER.md](./ASSURANCE_LADDER.md).

| Stage | Title | Status |
|-------|-------|--------|
| 1 | Source identity, AEGIS-SRC1, Connector, SDK, conformance | **Done** (see report for small Partials) |
| 2 | Honest labelling / provenance block everywhere | **Done** (Partials in report) |
| 3 | Decision token + executor confirm | **Done** (Partials in report) |
| 4 | Reconciliation + Exceptions | **Done** (Partials in report) |
| 5 | Approver binding (view hash + identity) | **Done**, WebAuthn **Partial** |
| 6 | Independent capture / PG collector (G3) | **Done** (live pgoutput on bank-core `:5436`; KMS live key **Partial**) |
| 7 | Third-party signed facts, input commitments, plausibility | **Done**, with Partials |
| 8 | Red Team suite + multi-system bank test environment | **Done**, with Partials |
| 9 | Documentation and demo | **Done**, with Partials (screenshots / full walk / marketing polish) |

## Grades reachable today

| Path | Grade | Honest note |
|------|-------|-------------|
| Unsigned ingest (org allows it) | G0 | Labelled as ingest-key only |
| Signed source envelope | G1 | Content accuracy not checked |
| Token confirm match and/or feed reconcile | G2 | Needs live confirm + reconcile, not only a story label |
| Collector / independent capture match | G3 | Live on bank-core with `wal_level=logical` + `aegis-collector-pg` |

## Cross-cutting Partials (still open)

- WebAuthn step-up on approve (Stage 5)
- AWS KMS Ed25519 live key in a real AWS account (code Ready; `smoke:kms` SKIP without `AEGIS_RECEIPT_KMS_KEY_ID`)
- Durable encrypted input-copy storage; Verify UI document picker (Stage 7)
- HSM keys, regulator co-sign, independent monitors, TEE — **roadmap, not built** ([ASSURANCE_LADDER.md](./ASSURANCE_LADDER.md))

Stage 9 deliverable table: [STAGE_9_REPORT.md](./STAGE_9_REPORT.md).
