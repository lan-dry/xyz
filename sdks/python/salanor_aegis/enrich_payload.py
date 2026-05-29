"""B-202 lite provenance enrichment (matches sdks/typescript/src/enrich-payload.ts)."""

from __future__ import annotations

from typing import Any


def enrich_provenance_payload(
    *,
    payload: dict[str, Any],
    tool_name: str | None = None,
    action_kind: str,
    policy_id: str | None = None,
) -> dict[str, Any]:
    out = dict(payload)
    tool = (tool_name or "").strip()

    if not _str(out.get("provider")) and "." in tool:
        out["provider"] = tool.split(".", 1)[0]
    if not _str(out.get("provider")) and action_kind == "llm_invocation":
        out["provider"] = "llm"

    if not _str(out.get("action")):
        purpose = _str(out.get("purpose"))
        action_desc = _str(out.get("action_description"))
        tool_action = None
        if tool:
            parts = tool.split(".")
            tool_action = ".".join(parts[1:]) if len(parts) > 1 else tool
        out["action"] = (
            purpose
            or action_desc
            or tool_action
            or action_kind.replace("_", " ")
        )

    if out.get("amount_usd") is None and out.get("amount") is not None:
        amount = _num(out.get("amount"))
        if amount is not None:
            out["amount_usd"] = amount

    if not _str(out.get("currency")) and out.get("amount_usd") is not None:
        out["currency"] = "USD"

    if not _str(out.get("authority")):
        if policy_id and policy_id != "none":
            out["authority"] = f"policy:{policy_id}"
        elif _str(out.get("trigger_source")):
            out["authority"] = f"trigger:{out['trigger_source']}"

    missing: list[str] = []
    if action_kind == "tool_call" and out.get("amount_usd") is None:
        missing.append("amount_usd")
    if not _str(out.get("trigger_source")) and action_kind != "human_approval":
        missing.append("trigger_source")
    if missing:
        out["_provenance_hints"] = missing

    return out


def _str(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _num(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not (value == value):  # NaN
            return None
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None
