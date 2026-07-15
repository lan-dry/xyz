from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from salanor_aegis_ledger.canonical import event_hash_from_body
from salanor_aegis_ledger.schema import validate_event
from salanor_aegis_ledger.store import append_event, last_event_hash, read_events

DEFAULT_SIGNATURE = {
    "alg": "local-placeholder",
    "value": "placeholder:0000000000000000000000000000000000000000000000000000000000000000",
}


def record(
    store_path: Path | str,
    payload: dict[str, Any],
    *,
    recorded_at: str | None = None,
    event_id: str | None = None,
) -> dict[str, Any]:
    path = Path(store_path)
    existing = read_events(path)
    prev = last_event_hash(existing)

    body: dict[str, Any] = {
        "aps_version": "0.1",
        "event_id": event_id or str(uuid.uuid4()),
        "recorded_at": recorded_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "tenant_id": payload.get("tenant_id", "local"),
        "actor": payload["actor"],
        "action": payload["action"],
        "subject": payload["subject"],
        "context": payload["context"],
        "signature": payload.get("signature", DEFAULT_SIGNATURE),
        "chain": {"prev_event_hash": prev},
    }

    event_hash = event_hash_from_body(body)
    event = {**body, "chain": {"prev_event_hash": prev, "event_hash": event_hash}}
    validate_event(event)
    append_event(path, event)
    return event
