#!/usr/bin/env python3
"""Independent AEGIS-SRC1 envelope verifier.

Deliberately shares no code with the TypeScript SDK. Uses:
  * `rfc8785`      - RFC 8785 JSON Canonicalization Scheme
  * `cryptography` - Ed25519 (RFC 8032) and the standard library for SHA-256

Spec:
  event_hash       = hex(SHA-256(JCS(event)))
  signing payload  = envelope without "signature" and without "event" (event_hash remains)
  signature input  = SHA-256("AEGIS-SRC1\\n" + source_id + "\\n" + key_id + "\\n"
                             + JCS(signing payload))
  signature        = Ed25519 over that 32-byte digest, base64url (no padding)
  Full event body is checked against event_hash only when present (not redacted).

Usage:
  verify_envelope.py --vectors ../../conformance/vectors.json
  verify_envelope.py --envelope envelope.json --public-key <base64|base64url>

Exit status: 0 = verified / all vectors pass, 1 = failure, 2 = usage / input error.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, NamedTuple

import rfc8785
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

ENVELOPE_VERSION = "1"
SIGNATURE_DOMAIN = "AEGIS-SRC1\n"
MAX_SAFE_INTEGER = 2**53 - 1

ENVELOPE_FIELDS = (
    "aegis_envelope",
    "source_id",
    "key_id",
    "seq",
    "ts",
    "nonce",
    "idempotency_key",
    "event",
    "event_hash",
)

_ID_RE = re.compile(r"[A-Za-z0-9._:-]{1,128}")
_TS_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z")
_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
_HEX256_RE = re.compile(r"[0-9a-f]{64}")
_B64URL_RE = re.compile(r"[A-Za-z0-9_-]*")
_B64_RE = re.compile(r"[A-Za-z0-9+/]*={0,2}")


class Result(NamedTuple):
    ok: bool
    reason: str | None = None
    detail: str | None = None


# --------------------------------------------------------------------------- #
# encoding helpers
# --------------------------------------------------------------------------- #
def b64url_decode(text: str) -> bytes | None:
    """Strict, canonical, unpadded base64url decode; None if malformed."""
    if not _B64URL_RE.fullmatch(text):
        return None
    try:
        raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError):
        return None
    if base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") != text:
        return None
    return raw


def decode_key(text: str) -> bytes | None:
    """Decode a key given as standard base64 (padded) or base64url."""
    if _B64URL_RE.fullmatch(text):
        return b64url_decode(text)
    if not _B64_RE.fullmatch(text):
        return None
    try:
        raw = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        return None
    return raw if base64.b64encode(raw).decode("ascii") == text else None


# --------------------------------------------------------------------------- #
# canonicalisation
# --------------------------------------------------------------------------- #
def _check_event_value(value: Any, path: str = "event") -> Any:
    """Event domain: null, bool, str, safe integer, list, dict. Returns a normalised copy."""
    if value is None or isinstance(value, (bool, str)):
        if isinstance(value, str):
            try:
                value.encode("utf-8")
            except UnicodeEncodeError as exc:
                raise ValueError(f"{path}: string contains a lone surrogate") from exc
        return value
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_INTEGER:
            raise ValueError(f"{path}: numbers must be safe integers")
        return value
    if isinstance(value, float):
        # JSON text such as 1.0 is the integer 1 for JCS purposes (parity with JavaScript).
        if value.is_integer() and abs(value) <= MAX_SAFE_INTEGER:
            return int(value)
        raise ValueError(f"{path}: numbers must be safe integers (use a decimal string for money)")
    if isinstance(value, list):
        return [_check_event_value(v, f"{path}[{i}]") for i, v in enumerate(value)]
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(f"{path}: object keys must be strings")
            try:
                key.encode("utf-8")
            except UnicodeEncodeError as exc:
                raise ValueError(f"{path} key: string contains a lone surrogate") from exc
            out[key] = _check_event_value(item, f"{path}.{key}")
        return out
    raise ValueError(f"{path}: unsupported value type {type(value).__name__}")


def jcs(value: Any) -> bytes:
    """RFC 8785 canonical UTF-8 bytes."""
    return rfc8785.dumps(value)


def event_hash(event: dict) -> str:
    return hashlib.sha256(jcs(_check_event_value(event))).hexdigest()


def signing_payload(envelope: dict) -> dict:
    """Envelope without signature and without event — only event_hash binds the body."""
    return {k: v for k, v in envelope.items() if k not in ("signature", "event")}


def signature_input(envelope: dict) -> bytes:
    """32-byte digest that is signed (AEGIS-SRC1 domain; RFC 8785 JCS)."""
    payload = signing_payload(envelope)
    prefix = f"{SIGNATURE_DOMAIN}{payload['source_id']}\n{payload['key_id']}\n".encode("utf-8")
    return hashlib.sha256(prefix + jcs(payload)).digest()


def is_full_event_body(event: Any) -> bool:
    return isinstance(event, dict) and event.get("redacted_by_field_policy") is not True


# --------------------------------------------------------------------------- #
# verification
# --------------------------------------------------------------------------- #
def _shape_error(envelope: Any) -> str | None:
    if not isinstance(envelope, dict):
        return "envelope must be an object"
    allowed = set(ENVELOPE_FIELDS) | {"signature"}
    for key in envelope:
        if key not in allowed:
            return f"unknown field: {key}"
    for key in ENVELOPE_FIELDS:
        if key not in envelope:
            return f"missing field: {key}"
    e = envelope
    if not isinstance(e["source_id"], str) or not _ID_RE.fullmatch(e["source_id"]):
        return "invalid source_id"
    if not isinstance(e["key_id"], str) or not _ID_RE.fullmatch(e["key_id"]):
        return "invalid key_id"
    seq = e["seq"]
    if isinstance(seq, bool) or not isinstance(seq, int) or seq < 1 or seq > MAX_SAFE_INTEGER:
        return "seq must be a positive safe integer"
    ts = e["ts"]
    if not isinstance(ts, str) or not _TS_RE.fullmatch(ts):
        return "ts must be ISO-8601 UTC with millisecond precision"
    try:
        datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return "ts must be ISO-8601 UTC with millisecond precision"
    nonce = e["nonce"]
    if not isinstance(nonce, str) or len(b64url_decode(nonce) or b"") != 16:
        return "nonce must be base64url of 16 bytes"
    idem = e["idempotency_key"]
    if not isinstance(idem, str) or not _UUID_RE.fullmatch(idem):
        return "idempotency_key must be a UUID"
    ehash = e["event_hash"]
    if not isinstance(ehash, str) or not _HEX256_RE.fullmatch(ehash):
        return "event_hash must be 64 lowercase hex chars"
    if not isinstance(e["event"], dict):
        return "event must be an object"
    try:
        _check_event_value(e["event"])
    except ValueError as exc:
        return str(exc)
    return None


def verify_envelope(envelope: Any, public_key: str | bytes) -> Result:
    """Never raises. Reasons match the TypeScript SDK:
    malformed | unsupported_version | event_hash_mismatch | bad_signature."""
    if (
        isinstance(envelope, dict)
        and "aegis_envelope" in envelope
        and envelope["aegis_envelope"] != ENVELOPE_VERSION
    ):
        return Result(False, "unsupported_version")
    shape = _shape_error(envelope)
    if shape:
        return Result(False, "malformed", shape)
    if not isinstance(envelope.get("signature"), str):
        return Result(False, "malformed", "missing field: signature")
    signature = b64url_decode(envelope["signature"])
    if signature is None or len(signature) != 64:
        return Result(False, "malformed", "signature must be base64url of 64 bytes")
    if is_full_event_body(envelope["event"]):
        if event_hash(envelope["event"]) != envelope["event_hash"]:
            return Result(False, "event_hash_mismatch")
        event_idem = envelope["event"].get("idempotency_key")
        if isinstance(event_idem, str) and event_idem != envelope["idempotency_key"]:
            return Result(
                False,
                "malformed",
                "envelope.idempotency_key must equal event.idempotency_key",
            )
    key_bytes = decode_key(public_key) if isinstance(public_key, str) else public_key
    if key_bytes is None or len(key_bytes) != 32:
        return Result(False, "malformed", "public key must be 32 bytes")
    try:
        Ed25519PublicKey.from_public_bytes(key_bytes).verify(signature, signature_input(envelope))
    except (InvalidSignature, ValueError):
        return Result(False, "bad_signature")
    return Result(True)


# --------------------------------------------------------------------------- #
# vectors
# --------------------------------------------------------------------------- #
def _strict_json_load(text: str) -> Any:
    def no_dups(pairs: list[tuple[str, Any]]) -> dict:
        out: dict = {}
        for key, value in pairs:
            if key in out:
                raise ValueError(f"duplicate key: {key}")
            out[key] = value
        return out

    def no_constants(name: str) -> Any:
        raise ValueError(f"invalid JSON constant: {name}")

    return json.loads(text, object_pairs_hook=no_dups, parse_constant=no_constants)


def run_vectors(path: Path) -> int:
    data = _strict_json_load(path.read_text(encoding="utf-8"))
    failures: list[str] = []
    positives = data["vectors"]
    negatives = data["negative_vectors"]

    for v in positives:
        vid = v["id"]
        env = v["envelope_without_signature"]
        try:
            checks = {
                "event_jcs": jcs(_check_event_value(env["event"])).decode("utf-8") == v["event_jcs"],
                "event_hash": event_hash(env["event"]) == v["event_hash"] == env["event_hash"],
                "canonical_envelope_jcs": jcs(
                    {**env, "event": _check_event_value(env["event"])}
                ).decode("utf-8")
                == v["canonical_envelope_jcs"],
                "canonical_envelope_utf8_hex": jcs(env).hex() == v["canonical_envelope_utf8_hex"],
                "signature_input_hash": signature_input(env).hex() == v["signature_input_hash"],
                "verify": verify_envelope(
                    {**env, "signature": v["signature_b64url"]}, v["public_key_b64"]
                ).ok,
            }
        except Exception as exc:  # noqa: BLE001 - report any divergence as a failure
            failures.append(f"{vid}: exception {exc!r}")
            continue
        for name, passed in checks.items():
            if not passed:
                failures.append(f"{vid}: {name} mismatch")

    for v in negatives:
        result = verify_envelope(v["envelope"], v["public_key_b64"])
        if result.ok or result.reason != v["expected"]["reason"]:
            failures.append(
                f"{v['id']}: expected {v['expected']['reason']}, got "
                f"{'ok' if result.ok else result.reason} ({result.detail})"
            )

    total = len(positives) + len(negatives)
    if failures:
        for line in failures:
            print(f"FAIL {line}", file=sys.stderr)
        print(f"[python] {len(failures)} failure(s) across {total} vectors", file=sys.stderr)
        return 1
    print(f"[python] {len(positives)} positive + {len(negatives)} negative vectors OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Independent AEGIS-SRC1 envelope verifier")
    parser.add_argument("--vectors", type=Path, help="run a conformance vectors.json")
    parser.add_argument("--envelope", type=Path, help="signed envelope JSON file ('-' for stdin)")
    parser.add_argument("--public-key", help="Ed25519 public key (base64 or base64url)")
    args = parser.parse_args(argv)

    if args.vectors:
        return run_vectors(args.vectors)
    if args.envelope and args.public_key:
        text = sys.stdin.read() if str(args.envelope) == "-" else args.envelope.read_text(encoding="utf-8")
        try:
            envelope = _strict_json_load(text)
        except ValueError as exc:
            print(f"invalid JSON: {exc}", file=sys.stderr)
            return 2
        result = verify_envelope(envelope, args.public_key)
        if result.ok:
            print("OK")
            return 0
        print(f"FAIL {result.reason}" + (f": {result.detail}" if result.detail else ""), file=sys.stderr)
        return 1
    parser.print_usage(sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
