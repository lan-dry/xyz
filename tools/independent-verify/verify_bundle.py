#!/usr/bin/env python3
"""Independent verifier for an exported Aegis evidence bundle (G1 source envelopes).

Checks, without sharing TypeScript code:
  * receipt sequence continuity (seq ascending by 1; prev_hash chain when present)
  * each attached AEGIS-SRC1 envelope signature (via verify_envelope)
  * source key present in bundle.source_keys / source_registry
  * key valid at the envelope's recorded ts (valid_from / valid_to / not revoked)

Usage:
  python verify_bundle.py --bundle path/to/export.json

Exit: 0 ok, 1 findings, 2 usage/input.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from verify_envelope import Result, verify_envelope


def _parse_ts(value: str) -> datetime | None:
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except ValueError:
        return None


def _extract_envelope(receipt: dict[str, Any]) -> dict[str, Any] | None:
    attrs = receipt.get("attributes")
    if not isinstance(attrs, dict):
        return None
    candidates = [attrs.get("source_envelope")]
    prov = attrs.get("provenance")
    if isinstance(prov, dict):
        candidates.append(prov.get("source_envelope"))
    for c in candidates:
        if (
            isinstance(c, dict)
            and isinstance(c.get("signature"), str)
            and isinstance(c.get("key_id"), str)
        ):
            return c
    return None


def _key_valid_at(entry: dict[str, Any], ts: str) -> bool:
    status = entry.get("status")
    if status == "revoked":
        return False
    if status not in ("active", "rotated"):
        return False
    t = _parse_ts(ts)
    frm = _parse_ts(str(entry.get("valid_from", "")))
    if t is None or frm is None or t < frm:
        return False
    valid_to = entry.get("valid_to")
    if valid_to not in (None, ""):
        to = _parse_ts(str(valid_to))
        if to is None or t >= to:
            return False
    return True


def verify_bundle(bundle: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    receipts = bundle.get("receipts")
    if not isinstance(receipts, list) or not receipts:
        return ["missing_receipts: bundle.receipts required"]

    # Sequence continuity
    prev_hash: str | None = None
    prev_seq: int | None = None
    for r in receipts:
        if not isinstance(r, dict):
            findings.append("malformed_receipt: not an object")
            continue
        rid = str(r.get("receipt_id", "?"))
        seq = r.get("seq")
        if not isinstance(seq, int):
            findings.append(f"missing_sequence: {rid} has no integer seq")
            continue
        if prev_seq is not None and seq != prev_seq + 1:
            findings.append(
                f"missing_sequence: gap between seq {prev_seq} and {seq} ({rid})"
            )
        ph = r.get("prev_hash")
        if prev_hash is not None and ph != prev_hash:
            findings.append(f"prev_hash_mismatch: {rid}")
        prev_hash = r.get("receipt_hash") if isinstance(r.get("receipt_hash"), str) else prev_hash
        prev_seq = seq

        envelope = _extract_envelope(r)
        if envelope is None:
            continue
        key_id = str(envelope["key_id"])
        registry = bundle.get("source_registry") if isinstance(bundle.get("source_registry"), list) else []
        registry_entry = next(
            (e for e in registry if isinstance(e, dict) and e.get("key_id") == key_id),
            None,
        )
        source_keys = bundle.get("source_keys") if isinstance(bundle.get("source_keys"), dict) else {}
        pub = source_keys.get(key_id)
        if pub is None and registry_entry is not None:
            pub = registry_entry.get("public_key_b64")
        if not isinstance(pub, str) or not pub:
            findings.append(f"source_key_missing: {key_id} on {rid}")
            continue
        if registry and registry_entry is not None:
            ts = envelope.get("ts") if isinstance(envelope.get("ts"), str) else ""
            if not _key_valid_at(registry_entry, ts):
                findings.append(
                    f"source_key_not_valid_at_ts: {key_id} on {rid} at {ts}"
                )
        result: Result = verify_envelope(envelope, pub)
        if not result.ok:
            code = (
                "source_event_hash_mismatch"
                if result.reason == "event_hash_mismatch"
                else "source_signature_invalid"
            )
            findings.append(f"{code}: {rid} ({result.reason})")

    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Independent evidence-bundle verifier")
    parser.add_argument("--bundle", type=Path, required=True, help="exported bundle JSON")
    args = parser.parse_args(argv)
    try:
        bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"invalid bundle: {exc}", file=sys.stderr)
        return 2
    if not isinstance(bundle, dict):
        print("invalid bundle: root must be an object", file=sys.stderr)
        return 2
    findings = verify_bundle(bundle)
    if findings:
        for f in findings:
            print(f"FAIL {f}", file=sys.stderr)
        print(f"[python-bundle] {len(findings)} finding(s)", file=sys.stderr)
        return 1
    print("[python-bundle] OK (signature, key-at-ts, sequence continuity)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
