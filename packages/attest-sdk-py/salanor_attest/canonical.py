from __future__ import annotations

import hashlib
import json
from typing import Any


def _sort(value: Any) -> Any:
    if isinstance(value, list):
        return [_sort(v) for v in value]
    if isinstance(value, dict):
        return {k: _sort(value[k]) for k in sorted(value)}
    return value


def canonicalize(value: Any) -> str:
    return json.dumps(_sort(value), separators=(",", ":"), sort_keys=True)


def event_hash_from_body(body: dict[str, Any]) -> str:
    digest = hashlib.sha256(canonicalize(body).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"
