from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCHEMA_PATH = _REPO_ROOT / "spec" / "aps" / "v0.1.json"


class ApsValidationError(ValueError):
    def __init__(self, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.details = details or []


def _validator() -> Draft202012Validator:
    schema = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def validate_event(event: object) -> None:
    validator = _validator()
    errors = sorted(validator.iter_errors(event), key=lambda e: e.path)
    if errors:
        details = [f"/{'/'.join(str(p) for p in err.path)} {err.message}" for err in errors]
        raise ApsValidationError("APS event failed schema validation", details)
