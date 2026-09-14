"""Span helpers (aligned with sdks/typescript/src/span.ts)."""

from __future__ import annotations

import uuid
from typing import Any


def new_span_id() -> str:
    return f"spn_{uuid.uuid4().hex[:20]}"


def span_payload(span_id: str, label: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"span_id": span_id}
    if label:
        out["span_label"] = label
    return out


def merge_span_payload(
    span_id: str,
    label: str | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {**payload, **span_payload(span_id, label)}
