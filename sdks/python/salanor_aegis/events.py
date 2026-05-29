"""Event builders for policy and HTTP result records."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from salanor_aegis.ids import new_event_id

PolicyDecision = Literal["allow", "deny", "allow_with_obligation", "allow_retro_audit"]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def build_policy_decision_event(
    *,
    organization_id: str,
    trace_id: str,
    agent_id: str,
    key_id: str,
    tool_name: str,
    decision: PolicyDecision,
    actor_principal: str,
    policy_id: str | None = None,
    rule_id: str | None = None,
    reason: str | None = None,
    span_id: str | None = None,
    parent_span_id: str | None = None,
    payload_extras: dict[str, Any] | None = None,
) -> dict[str, Any]:
    denied = decision == "deny"
    payload: dict[str, Any] = {
        "policy_id": policy_id,
        "rule_id": rule_id or ("deny:unattributed" if denied else "allow:default"),
        "reason": reason or ("policy denied" if denied else "policy allowed"),
        **(payload_extras or {}),
    }
    event: dict[str, Any] = {
        "schema_version": 1,
        "event_id": new_event_id(),
        "organization_id": organization_id,
        "trace_id": trace_id,
        "agent_id": agent_id,
        "key_id": key_id,
        "emitted_at": _utc_now_iso(),
        "actor_type": "agent",
        "actor_principal": actor_principal,
        "action_kind": "policy_decision",
        "policy_decision": decision,
        "tool_name": tool_name,
        "payload": payload,
    }
    if policy_id and policy_id != "none":
        event["policy_id"] = policy_id
    if span_id:
        event["span_id"] = span_id
    if parent_span_id:
        event["parent_span_id"] = parent_span_id
    return event
