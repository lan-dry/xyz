"""Shared option types for sign, ingest, and record helpers."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SignOptions:
    private_key_b64: str
    key_id: str


@dataclass(frozen=True)
class IngestOptions:
    api_base_url: str
    ingest_api_key: str
    idempotency_key: str | None = None


@dataclass(frozen=True)
class RecordContext:
    organization_id: str
    agent_id: str
    key_id: str
    trace_id: str
    actor_principal: str


@dataclass
class RecordOptions:
    sign: SignOptions
    ingest: IngestOptions
    span_id: str | None = None
    span_label: str | None = None
    enrich_payload: bool = True
