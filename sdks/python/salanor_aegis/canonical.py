"""APS-1 canonical signing (JCS + Ed25519), aligned with sdks/typescript and sdks/go."""

from __future__ import annotations

import base64
import hashlib
from typing import Any, Mapping, MutableMapping

import jcs
from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

_SIG_FIELDS = frozenset({"sig_alg", "sig_value_b64"})


def strip_signature_fields(event: Mapping[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in event.items() if k not in _SIG_FIELDS}


def signing_digest(event: Mapping[str, Any], key_id: str) -> bytes:
    signing = strip_signature_fields(event)
    jcs_bytes = jcs.canonicalize(signing)
    prefixed = f"APS1\n{key_id}\n{jcs_bytes.decode('utf-8')}"
    return hashlib.sha256(prefixed.encode("utf-8")).digest()


def digest_hex(event: Mapping[str, Any], key_id: str) -> str:
    return signing_digest(event, key_id).hex()


def sign_event(
    event: Mapping[str, Any],
    *,
    private_key_b64: str,
    key_id: str,
) -> dict[str, Any]:
    priv_raw = base64.b64decode(private_key_b64)
    if len(priv_raw) != 32:
        raise ValueError("Ed25519 private key must be 32 bytes (base64 seed)")
    key = SigningKey(priv_raw)
    digest = signing_digest(event, key_id)
    sig = key.sign(digest).signature
    signed: dict[str, Any] = dict(event)
    signed["sig_alg"] = "ed25519"
    signed["sig_value_b64"] = base64.b64encode(sig).decode("ascii")
    return signed


def verify_event_signature(event: Mapping[str, Any], public_key_b64: str) -> bool:
    if event.get("sig_alg") != "ed25519" or not event.get("sig_value_b64"):
        return False
    try:
        pub_raw = base64.b64decode(public_key_b64)
        if len(pub_raw) != 32:
            return False
        verify_key = VerifyKey(pub_raw)
        digest = signing_digest(event, str(event["key_id"]))
        sig = base64.b64decode(str(event["sig_value_b64"]))
        verify_key.verify(digest, sig)
        return True
    except (BadSignatureError, ValueError, KeyError):
        return False
