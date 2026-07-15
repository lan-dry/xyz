"""Salanor Aegis Python SDK — APS-1 sign, ingest, spans, and policy (pilot-ready)."""

from salanor_aegis.canonical import digest_hex, sign_event, signing_digest, verify_event_signature
from salanor_aegis.enrich_payload import enrich_provenance_payload
from salanor_aegis.ids import new_event_id, new_trace_id
from salanor_aegis.ingest import IngestResult, sign_and_ingest
from salanor_aegis.policy import PolicyDeniedError, PolicyEvaluateResult, enforce_tool_policy, evaluate_policy_via_api
from salanor_aegis.span import merge_span_payload, new_span_id, span_payload
from salanor_aegis.record import (
    end_span,
    record_data_access,
    record_decision,
    record_llm_invocation,
    record_provenance_claim,
    record_trace_start,
    span_payload,
    start_span,
)
from salanor_aegis.types import IngestOptions, RecordContext, RecordOptions, SignOptions

__all__ = [
    "IngestOptions",
    "IngestResult",
    "PolicyDeniedError",
    "PolicyEvaluateResult",
    "RecordContext",
    "RecordOptions",
    "SignOptions",
    "digest_hex",
    "end_span",
    "enforce_tool_policy",
    "enrich_provenance_payload",
    "evaluate_policy_via_api",
    "merge_span_payload",
    "new_event_id",
    "new_span_id",
    "new_trace_id",
    "record_data_access",
    "record_decision",
    "record_llm_invocation",
    "record_provenance_claim",
    "record_trace_start",
    "sign_and_ingest",
    "sign_event",
    "signing_digest",
    "span_payload",
    "start_span",
    "verify_event_signature",
]

__version__ = "0.2.0"
