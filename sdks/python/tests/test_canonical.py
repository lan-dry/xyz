import base64

from nacl.signing import SigningKey

from salanor_aegis.canonical import digest_hex, sign_event, signing_digest, verify_event_signature


def _sample_event() -> dict:
    return {
        "schema_version": 1,
        "event_id": "evt_test",
        "organization_id": "11111111-1111-4111-8111-111111111111",
        "trace_id": "trc_test",
        "agent_id": "agent-dev-01",
        "key_id": "key-dev-01",
        "emitted_at": "2026-05-21T00:00:00.000Z",
        "actor_type": "agent",
        "actor_principal": "test",
        "action_kind": "tool_call",
        "policy_decision": "allow",
        "payload": {"k": "v"},
    }


def test_signing_digest_stable() -> None:
    event = _sample_event()
    assert signing_digest(event, "key-dev-01") == signing_digest(event, "key-dev-01")


def test_sign_and_verify_roundtrip() -> None:
    seed = SigningKey.generate()
    priv_b64 = base64.b64encode(seed.encode()).decode()
    pub_b64 = base64.b64encode(seed.verify_key.encode()).decode()
    event = _sample_event()
    signed = sign_event(event, private_key_b64=priv_b64, key_id="key-dev-01")
    assert signed["sig_alg"] == "ed25519"
    assert verify_event_signature(signed, pub_b64)
    assert digest_hex(event, "key-dev-01") == digest_hex(signed, "key-dev-01")
