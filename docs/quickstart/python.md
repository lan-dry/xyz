# Quickstart — Python

Uses the standard library plus `urllib` only (no extra deps required for unsigned bank events).

```python
import json, os, urllib.request, uuid
from datetime import datetime, timezone

api = os.environ["AEGIS_API_BASE"].rstrip("/")
key = os.environ["AEGIS_INGEST_KEY"]

body = {
  "schema_version": 1,
  "case_id": "SBX-PY-001",
  "idempotency_key": str(uuid.uuid4()),
  "event_type": "loan_decision",
  "product": "retail_loan",
  "emitted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
  "actor": {"type": "system", "id": "py-quickstart"},
  "attributes": {
    "amount": 1200000,
    "currency": "RWF",
    "beneficiary_account": "ACCT-DEMO-001",
  },
  "trace_id": f"tr_py_{uuid.uuid4().hex[:8]}",
}

req = urllib.request.Request(
  f"{api}/v1/aegis/bank/events",
  data=json.dumps(body).encode(),
  headers={
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
  },
  method="POST",
)
with urllib.request.urlopen(req) as resp:
  print(resp.read().decode())
```

Verify the bundle with `pnpm aegis-verify` or the Verify page.
