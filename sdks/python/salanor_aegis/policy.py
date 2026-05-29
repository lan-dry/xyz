"""Policy evaluation via Aegis API (Python alternative to TypeScript wrapFetch)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal

from salanor_aegis.events import build_policy_decision_event
from salanor_aegis.ingest import sign_and_ingest
from salanor_aegis.types import RecordContext, RecordOptions

PolicyDecision = Literal["allow", "deny", "allow_with_obligation"]


class PolicyDeniedError(RuntimeError):
    """Raised when policy evaluation returns deny."""

    def __init__(self, tool_name: str) -> None:
        super().__init__(f"Policy denied tool: {tool_name}")
        self.tool_name = tool_name


@dataclass(frozen=True)
class PolicyEvaluateResult:
    decision: PolicyDecision
    policy_id: str
    rule_id: str | None
    reason: str
    engine: str | None = None


def evaluate_policy_via_api(
    api_base_url: str,
    ingest_api_key: str,
    *,
    organization_id: str,
    agent_id: str,
    tool_name: str,
    timeout_sec: float = 30,
) -> PolicyEvaluateResult:
    base = api_base_url.rstrip("/")
    url = f"{base}/v1/aegis/policy/evaluate"
    body = json.dumps(
        {
            "organization_id": organization_id,
            "agent_id": agent_id,
            "tool_name": tool_name,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {ingest_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            err_body = json.loads(raw)
        except json.JSONDecodeError:
            err_body = {"error": raw}
        raise RuntimeError(
            f"Policy evaluate failed ({e.code}): {err_body.get('error', raw)}"
        ) from e
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Cannot reach Aegis API at {api_base_url} ({e.reason})."
        ) from e

    decision = payload.get("decision")
    if decision not in ("allow", "deny", "allow_with_obligation"):
        raise RuntimeError("Invalid policy decision from API")

    return PolicyEvaluateResult(
        decision=decision,
        policy_id=str(payload.get("policy_id", "")),
        rule_id=payload.get("rule_id"),
        reason=str(payload.get("reason", "")),
        engine=payload.get("engine"),
    )


def enforce_tool_policy(
    ctx: RecordContext,
    tool_name: str,
    options: RecordOptions,
    *,
    audit_payload: dict[str, Any] | None = None,
) -> PolicyEvaluateResult:
    """
    Evaluate policy for a tool, ingest a policy_decision event, and raise on deny.

    Call before executing a sensitive outbound action (payments, writes, etc.).
    """
    result = evaluate_policy_via_api(
        options.ingest.api_base_url,
        options.ingest.ingest_api_key,
        organization_id=ctx.organization_id,
        agent_id=ctx.agent_id,
        tool_name=tool_name,
    )

    extras = dict(audit_payload or {})
    event = build_policy_decision_event(
        organization_id=ctx.organization_id,
        trace_id=ctx.trace_id,
        agent_id=ctx.agent_id,
        key_id=ctx.key_id,
        tool_name=tool_name,
        decision=result.decision,
        actor_principal=ctx.actor_principal,
        policy_id=result.policy_id,
        rule_id=result.rule_id,
        reason=result.reason,
        span_id=options.span_id,
        payload_extras=extras,
    )

    sign_and_ingest(
        event,
        private_key_b64=options.sign.private_key_b64,
        key_id=options.sign.key_id,
        api_base_url=options.ingest.api_base_url,
        ingest_api_key=options.ingest.ingest_api_key,
        idempotency_key=options.ingest.idempotency_key,
    )

    if result.decision == "deny":
        raise PolicyDeniedError(tool_name)

    return result
