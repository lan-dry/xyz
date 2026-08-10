"""CrewAI tool wrapper — policy gate before side-effectful tools."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from functools import wraps
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


class PolicyDeniedError(RuntimeError):
    def __init__(self, tool_name: str, reason: str) -> None:
        super().__init__(f"Policy denied {tool_name}: {reason}")
        self.tool_name = tool_name
        self.reason = reason


def evaluate_policy(
    *,
    api_base_url: str,
    ingest_token: str,
    organization_id: str,
    agent_id: str,
    tool_name: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = api_base_url.rstrip("/") + "/v1/aegis/policy/evaluate"
    body = {
        "organization_id": organization_id,
        "agent_id": agent_id,
        "tool_name": tool_name,
        "payload": payload or {},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {ingest_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Policy evaluate failed ({err.code}): {detail}") from err


def governed_tool(
    *,
    api_base_url: str,
    ingest_token: str,
    organization_id: str,
    agent_id: str,
    tool_name: str,
    key_id: str | None = None,
    private_key_b64: str | None = None,
) -> Callable[[F], F]:
    """
    Decorator for CrewAI @tool functions.
    Evaluates Aegis policy before the tool body runs.
    Signing/ingest of APS-1 events: use your agent runtime SDK or Workflow Bridge for full traces.
    """

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            payload: dict[str, Any] = {}
            if args:
                if len(args) == 1 and isinstance(args[0], dict):
                    payload = args[0]
                else:
                    payload = {"args": list(args)}
            if kwargs:
                payload = {**payload, **kwargs}

            decision = evaluate_policy(
                api_base_url=api_base_url,
                ingest_token=ingest_token,
                organization_id=organization_id,
                agent_id=agent_id,
                tool_name=tool_name,
                payload=payload,
            )
            if decision.get("decision") == "deny":
                raise PolicyDeniedError(tool_name, decision.get("reason", "denied"))
            if decision.get("decision") == "allow_with_obligation":
                raise RuntimeError(
                    f"Human approval required for {tool_name}: {decision.get('reason', '')}"
                )

            _ = (key_id, private_key_b64)  # reserved for future signed ingest hook
            return fn(*args, **kwargs)

        return wrapper  # type: ignore[return-value]

    return decorator
