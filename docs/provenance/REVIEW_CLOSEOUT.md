# Review closeout (feature/provenance-g3-kms)

## Live proof (paste)

### Environment
```
wal_level | logical   (salanor-bank-core-pg :5436)
bank_app  | rolreplication = f
aegis_collector | rolreplication = t
publication aegis_collector; slot aegis_collector_slot (pgoutput)
```

### Live G3 (`docs/provenance/_raw/live_g3_console.txt`)
```
after_cdc_grade {"case_id":"SIM-DFD9C418F6","grade":"G3"}
insider_exception {"found":true,"kind":"db_value_mismatch",… "elapsed_ms":209}
grade_after_contradict {"grade":"G3"}
orphan_exception {"found":true,"kind":"db_change_without_event","elapsed_ms":184}
LIVE_G3_PASS {"ok":true,"case_id":"SIM-DFD9C418F6","trace_id":"tr_sim_dfd9c418f6","g3":true,"contradicted":true,"orphan":true}
```

### Red Team #6 / #11 / #13 (`docs/provenance/_raw/redteam_6_11_13_g3.txt`)
```
#6  PASS: … executed_without_receipt
#11 PASS: db_change_without_event present
#13 PASS: amount_mismatch
```

### Screenshots
- `docs/TEST_PACK/provenance/case-g3-independently-captured.png`
- `docs/TEST_PACK/provenance/exceptions-insider-edit.png`
- `docs/TEST_PACK/provenance/case-g3-contradicted.png`

### Key custody
```
Partial: no AEGIS_RECEIPT_KMS_KEY_ID
SKIP smoke:kms AEGIS_RECEIPT_KMS_KEY_ID is not set
```
Code Ready: `kms-ed25519.ts` (ECC_NIST_EDWARDS25519 / ED25519_SHA_512 / RAW); receipts + decision tokens via `resolveReceiptSigning`.

## Status docs
Updated to match: `STAGE_6_REPORT.md`, `FINAL_STATUS.md`, `COLLECTOR.md`, `ASSURANCE_LADDER.md`, `docs/PROVENANCE.md`, `docs/DEMO.md`.
