# Quickstart — curl

Prerequisites: sandbox org, ingest API key, API base URL.

```bash
export AEGIS_API_BASE=https://api.salanor.com   # or staging / local
export AEGIS_INGEST_KEY=aegis_…                 # sandbox ingest key

# 1) Health
curl -sS "$AEGIS_API_BASE/ready" | head

# 2) Send a governed bank event (unsigned ingest path — G0)
# Prefer source-signed envelopes (G1) via the Connector quickstart.
curl -sS -X POST "$AEGIS_API_BASE/v1/aegis/bank/events" \
  -H "Authorization: Bearer $AEGIS_INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": 1,
    "case_id": "SBX-CURL-001",
    "idempotency_key": "curl-demo-1",
    "event_type": "loan_decision",
    "product": "retail_loan",
    "emitted_at": "2026-01-15T10:00:00.000Z",
    "actor": { "type": "system", "id": "curl-quickstart" },
    "attributes": {
      "amount": 1200000,
      "currency": "RWF",
      "beneficiary_account": "ACCT-DEMO-001",
      "applicant_name": "Sandbox Test"
    },
    "trace_id": "tr_curl_1"
  }'
```

3. Open the case in the console → download evidence bundle.  
4. Verify: `pnpm aegis-verify --bundle path/to/bundle.json` (or the Verify page).
