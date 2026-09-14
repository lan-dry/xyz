"""ULID-style ids for traces and events."""

from __future__ import annotations

import uuid


def new_event_id() -> str:
    return f"evt_{uuid.uuid4().hex[:24]}"


def new_trace_id() -> str:
    return f"trc_{uuid.uuid4().hex[:24]}"
