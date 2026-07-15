"""POST signed events to the Aegis ingest API."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Mapping

from salanor_aegis.canonical import sign_event

API_VERSION = "2026-05-18"


@dataclass
class IngestResult:
    event_id: str
    status: str
    sequence_num: int | None = None
    event_hash: str | None = None


def sign_and_ingest(
    event: Mapping[str, Any],
    *,
    private_key_b64: str,
    key_id: str,
    api_base_url: str,
    ingest_api_key: str,
    idempotency_key: str | None = None,
) -> IngestResult:
    signed = sign_event(event, private_key_b64=private_key_b64, key_id=key_id)
    base = api_base_url.rstrip("/")
    url = f"{base}/v1/aegis/events"
    body = json.dumps(signed).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {ingest_api_key}",
        "Content-Type": "application/json",
        "Salanor-Version": API_VERSION,
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"error": raw}
        err = payload.get("error", raw)
        raise RuntimeError(f"Ingest failed ({e.code}): {err}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Cannot reach Aegis API at {api_base_url} ({e.reason}). "
            "Check AEGIS_API_URL and network."
        ) from e

    return IngestResult(
        event_id=str(payload.get("event_id", "")),
        status=str(payload.get("status", "")),
        sequence_num=payload.get("sequence_num"),
        event_hash=payload.get("event_hash"),
    )
