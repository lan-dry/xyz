from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from salanor_aegis_ledger.canonical import canonicalize
from salanor_aegis_ledger.store import read_events

TIER_A_ACTIONS = {"decision.record"}


def replay(store_path: Path | str, trace_id: str = "local") -> dict[str, Any]:
    events = read_events(Path(store_path))
    steps: list[dict[str, Any]] = []
    for event in events:
        if event.get("action") not in TIER_A_ACTIONS:
            continue
        ctx = event["context"]
        steps.append(
            {
                "event_id": event["event_id"],
                "action": event["action"],
                "subject": event["subject"],
                "tier": "A",
                "reconstructed": {
                    "inputs": ctx.get("inputs", {}),
                    "model": ctx.get("model"),
                    "policy": ctx.get("policy"),
                    "outcome": ctx.get("outcome", {}),
                },
            }
        )
    digest = hashlib.sha256(canonicalize({"trace_id": trace_id, "steps": steps}).encode()).hexdigest()
    return {"trace_id": trace_id, "steps": steps, "digest": f"sha256:{digest}"}
