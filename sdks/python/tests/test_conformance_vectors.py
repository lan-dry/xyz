import json
from pathlib import Path

from salanor_aegis.canonical import digest_hex, sign_event

VECTORS = Path(__file__).resolve().parents[2] / "conformance" / "vectors" / "signing-digest-v1.json"


def test_conformance_signing_vectors() -> None:
    data = json.loads(VECTORS.read_text(encoding="utf-8"))
    for case in data["cases"]:
        event = case["event"]
        key_id = case["key_id"]
        assert digest_hex(event, key_id) == case["digest_hex"], case["name"]
        if case.get("private_key_seed_b64") and case.get("sig_value_b64"):
            signed = sign_event(
                event,
                private_key_b64=case["private_key_seed_b64"],
                key_id=key_id,
            )
            assert signed["sig_value_b64"] == case["sig_value_b64"], case["name"]
