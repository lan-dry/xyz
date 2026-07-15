"""High-level signed ingest helpers (parity with sdks/typescript/src/record.ts)."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

from salanor_aegis.enrich_payload import enrich_provenance_payload
from salanor_aegis.ids import new_event_id, new_trace_id
from salanor_aegis.ingest import sign_and_ingest
from salanor_aegis.span import merge_span_payload, new_span_id, span_payload
from salanor_aegis.types import RecordContext, RecordOptions

__all__ = [
    "new_trace_id",
    "new_span_id",
    "span_payload",
    "merge_span_payload",
    "record_trace_start",
    "record_llm_invocation",
    "record_provenance_claim",
    "record_decision",
    "record_data_access",
    "start_span",
    "end_span",
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _apply_enrich(event: dict[str, Any], options: RecordOptions) -> dict[str, Any]:
    if not options.enrich_payload:
        return event
    payload = enrich_provenance_payload(
        payload=dict(event.get("payload") or {}),
        tool_name=event.get("tool_name"),
        action_kind=str(event["action_kind"]),
        policy_id=event.get("policy_id"),
    )
    return {**event, "payload": payload}


def _ingest_event(event: dict[str, Any], options: RecordOptions) -> str:
    span_id = options.span_id
    if span_id:
        payload = dict(event.get("payload") or {})
        event = {
            **event,
            "span_id": span_id,
            "payload": merge_span_payload(span_id, options.span_label, payload),
        }
    enriched = _apply_enrich(event, options)
    result = sign_and_ingest(
        enriched,
        private_key_b64=options.sign.private_key_b64,
        key_id=options.sign.key_id,
        api_base_url=options.ingest.api_base_url,
        ingest_api_key=options.ingest.ingest_api_key,
        idempotency_key=options.ingest.idempotency_key,
    )
    return result.event_id


def record_trace_start(
    ctx: RecordContext,
    *,
    trigger_source: str,
    trigger_detail: str | None = None,
    business_context: str | None = None,
    options: RecordOptions,
) -> str:
    span_id = options.span_id or new_span_id()
    payload = merge_span_payload(
        span_id,
        options.span_label or "Session start",
        {
            "trigger_source": trigger_source,
            "trigger_detail": trigger_detail,
            "business_context": business_context,
            "action": "trace_session_start",
        },
    )
    event = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": ctx.organization_id,
        "trace_id": ctx.trace_id,
        "agent_id": ctx.agent_id,
        "key_id": ctx.key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": ctx.actor_principal,
        "action_kind": "tool_call",
        "policy_decision": "allow",
        "tool_name": "aegis.trace.start",
        "payload": payload,
    }
    return _ingest_event(event, replace(options, span_id=span_id))


def record_llm_invocation(
    ctx: RecordContext,
    *,
    tool_name: str,
    purpose: str,
    prompt_preview: str,
    response_preview: str,
    data_touched: list[str] | None = None,
    parent_event_id: str | None = None,
    payload: dict[str, Any] | None = None,
    options: RecordOptions,
) -> str:
    base_payload: dict[str, Any] = {
        "purpose": purpose,
        "prompt_preview": prompt_preview,
        "response_preview": response_preview,
        "data_touched": data_touched or [],
        **(payload or {}),
    }
    span_id = options.span_id
    if span_id:
        base_payload = merge_span_payload(span_id, options.span_label, base_payload)

    event: dict[str, Any] = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": ctx.organization_id,
        "trace_id": ctx.trace_id,
        "agent_id": ctx.agent_id,
        "key_id": ctx.key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": ctx.actor_principal,
        "action_kind": "llm_invocation",
        "policy_decision": "allow",
        "tool_name": tool_name,
        "payload": base_payload,
    }
    if parent_event_id:
        event["parent_event_id"] = parent_event_id
    return _ingest_event(event, options)


def record_provenance_claim(
    ctx: RecordContext,
    *,
    claim: str,
    authority: str,
    subject_event_id: str | None = None,
    business_context: str | None = None,
    options: RecordOptions,
) -> str:
    event = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": ctx.organization_id,
        "trace_id": ctx.trace_id,
        "agent_id": ctx.agent_id,
        "key_id": ctx.key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": ctx.actor_principal,
        "action_kind": "provenance_claim",
        "policy_decision": "allow_retro_audit",
        "tool_name": "aegis.provenance.claim",
        "payload": {
            "claim": claim,
            "authority": authority,
            "subject_event_id": subject_event_id,
            "business_context": business_context,
            "action": "provenance_assertion",
        },
    }
    return _ingest_event(event, options)


def record_decision(
    ctx: RecordContext,
    *,
    decision: str,
    rationale: str,
    alternatives: list[str] | None = None,
    parent_event_id: str | None = None,
    options: RecordOptions,
) -> str:
    event: dict[str, Any] = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": ctx.organization_id,
        "trace_id": ctx.trace_id,
        "agent_id": ctx.agent_id,
        "key_id": ctx.key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": ctx.actor_principal,
        "action_kind": "decision",
        "policy_decision": "allow",
        "tool_name": "aegis.agent.decision",
        "payload": {
            "decision": decision,
            "rationale": rationale,
            "alternatives": alternatives or [],
            "action": "agent_decision",
        },
    }
    if parent_event_id:
        event["parent_event_id"] = parent_event_id
    return _ingest_event(event, options)


def record_data_access(
    ctx: RecordContext,
    *,
    operation: str,
    resource: str,
    fields: list[str] | None = None,
    classification: str | None = None,
    parent_event_id: str | None = None,
    options: RecordOptions,
) -> str:
    if operation not in ("read", "write"):
        raise ValueError("operation must be 'read' or 'write'")
    event: dict[str, Any] = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": ctx.organization_id,
        "trace_id": ctx.trace_id,
        "agent_id": ctx.agent_id,
        "key_id": ctx.key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": ctx.actor_principal,
        "action_kind": "data_access",
        "policy_decision": "allow",
        "tool_name": f"aegis.data.{operation}",
        "payload": {
            "operation": operation,
            "resource": resource,
            "fields": fields or [],
            "classification": classification,
            "action": f"{operation}_{resource}",
        },
    }
    if parent_event_id:
        event["parent_event_id"] = parent_event_id
    return _ingest_event(event, options)


def start_span(
    ctx: RecordContext,
    *,
    label: str,
    parent_span_id: str | None = None,
    options: RecordOptions,
) -> str:
    span_id = options.span_id or new_span_id()
    event: dict[str, Any] = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": ctx.organization_id,
        "trace_id": ctx.trace_id,
        "agent_id": ctx.agent_id,
        "key_id": ctx.key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": ctx.actor_principal,
        "action_kind": "tool_call",
        "policy_decision": "allow",
        "tool_name": "aegis.span.start",
        "span_id": span_id,
        "payload": {
            "span_id": span_id,
            "span_label": label,
            "parent_span_id": parent_span_id,
            "action": "span_start",
        },
    }
    if parent_span_id:
        event["parent_span_id"] = parent_span_id
    _ingest_event(event, replace(options, span_id=span_id, span_label=label))
    return span_id


def end_span(
    ctx: RecordContext,
    span_id: str,
    options: RecordOptions,
) -> str:
    event = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": ctx.organization_id,
        "trace_id": ctx.trace_id,
        "agent_id": ctx.agent_id,
        "key_id": ctx.key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": ctx.actor_principal,
        "action_kind": "tool_call",
        "policy_decision": "allow",
        "tool_name": "aegis.span.end",
        "span_id": span_id,
        "payload": {"span_id": span_id, "action": "span_end"},
    }
    return _ingest_event(event, replace(options, span_id=span_id))
