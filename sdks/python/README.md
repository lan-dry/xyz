# salanor-aegis (Python)

APS-1 **sign + ingest** for Python agents and workers. Matches `@salanor/aegis` (`sdks/typescript`) canonical signing and record helpers.

**Pilot scope:** `sign_and_ingest`, `record_*` helpers, spans, `enforce_tool_policy` / `evaluate_policy_via_api`. No HTTP `wrapFetch` — call `enforce_tool_policy` before outbound tools, or use the TypeScript SDK at the edge.

## Install

```bash
pip install -e ./sdks/python
# or from monorepo root after publish:
# pip install salanor-aegis
```

Requires **Python 3.10+**.

## Quick start (full trace)

```python
import os
from salanor_aegis import (
    IngestOptions,
    PolicyDeniedError,
    RecordContext,
    RecordOptions,
    SignOptions,
    enforce_tool_policy,
    new_trace_id,
    record_data_access,
    record_llm_invocation,
    record_trace_start,
    start_span,
    end_span,
)

sign = SignOptions(
    private_key_b64=os.environ["SIGNING_PRIVATE_KEY_B64"],
    key_id=os.environ["KEY_ID"],
)
ingest = IngestOptions(
    api_base_url=os.environ.get("AEGIS_API_URL", "http://127.0.0.1:8080"),
    ingest_api_key=os.environ["AEGIS_INGEST_API_KEY"],
)
opts = RecordOptions(sign=sign, ingest=ingest)

ctx = RecordContext(
    organization_id=os.environ["ORGANIZATION_ID"],
    agent_id=os.environ["AGENT_ID"],
    key_id=os.environ["KEY_ID"],
    trace_id=new_trace_id(),
    actor_principal="support-bot",
)

record_trace_start(ctx, trigger_source="ticket_webhook", options=opts)

span_id = start_span(ctx, label="LLM triage", options=opts)
record_data_access(
    ctx,
    operation="read",
    resource="ticket",
    fields=["customer_email", "message"],
    options=RecordOptions(sign=sign, ingest=ingest, span_id=span_id, span_label="LLM triage"),
)

record_llm_invocation(
    ctx,
    tool_name="openai.chat.completions",
    purpose="triage_support_ticket",
    prompt_preview="Customer: …",
    response_preview="Intent: refund",
    options=RecordOptions(sign=sign, ingest=ingest, span_id=span_id, span_label="LLM triage"),
)

try:
    enforce_tool_policy(
        ctx,
        "stripe.paymentIntents.create",
        RecordOptions(sign=sign, ingest=ingest, span_id=span_id, span_label="Payment tool"),
    )
except PolicyDeniedError:
    pass  # expected when policy blocks payments

end_span(ctx, span_id, opts)
```

## Low-level sign + ingest

```python
from salanor_aegis import sign_and_ingest, new_event_id

result = sign_and_ingest(
    {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": os.environ["ORGANIZATION_ID"],
        # … required APS-1 fields …
    },
    private_key_b64=os.environ["SIGNING_PRIVATE_KEY_B64"],
    key_id=os.environ["KEY_ID"],
    api_base_url=os.environ["AEGIS_API_URL"],
    ingest_api_key=os.environ["AEGIS_INGEST_API_KEY"],
)
```

## Tests

```bash
cd sdks/python && pip install -e ".[dev]" && pytest
```

From monorepo root: `pnpm sdk:conformance` (Python + TypeScript + Go vectors).
