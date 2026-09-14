import json
from pathlib import Path

import pytest

from salanor_aegis_ledger.schema import ApsValidationError, validate_event

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "aegis"


def test_valid_fixture():
    event = json.loads((FIXTURES / "valid-tier-a-event.json").read_text(encoding="utf-8"))
    validate_event(event)


def test_missing_actor_rejected():
    event = json.loads((FIXTURES / "invalid-missing-actor.json").read_text(encoding="utf-8"))
    with pytest.raises(ApsValidationError) as exc:
        validate_event(event)
    assert any("actor" in detail.lower() for detail in exc.value.details)


def test_malformed_signature_rejected():
    event = json.loads((FIXTURES / "invalid-malformed-signature.json").read_text(encoding="utf-8"))
    with pytest.raises(ApsValidationError):
        validate_event(event)
