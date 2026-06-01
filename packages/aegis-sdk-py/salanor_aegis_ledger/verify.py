from __future__ import annotations

from pathlib import Path
from typing import Any

from salanor_aegis_ledger.canonical import event_hash_from_body
from salanor_aegis_ledger.schema import ApsValidationError, validate_event
from salanor_aegis_ledger.store import read_events


def _body_without_event_hash(event: dict[str, Any]) -> dict[str, Any]:
    chain = event["chain"]
    return {**{k: v for k, v in event.items() if k != "chain"}, "chain": {"prev_event_hash": chain["prev_event_hash"]}}


def verify(store_path: Path | str) -> dict[str, Any]:
    events = read_events(Path(store_path))
    errors: list[str] = []
    expected_prev: str | None = None

    for index, event in enumerate(events):
        try:
            validate_event(event)
        except ApsValidationError as err:
            errors.append(f"event[{index}] schema: {err}")
            continue

        if event["chain"]["prev_event_hash"] != expected_prev:
            errors.append(f"event[{index}] prev_event_hash mismatch")

        computed = event_hash_from_body(_body_without_event_hash(event))
        if computed != event["chain"]["event_hash"]:
            errors.append(f"event[{index}] event_hash mismatch")

        expected_prev = event["chain"]["event_hash"]

    return {"ok": not errors, "event_count": len(events), "errors": errors}
