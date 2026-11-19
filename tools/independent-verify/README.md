# independent-verify

Independent Python verifier for AEGIS-SRC1 source envelopes. It shares no code with
`@salanor/aegis-sdk` and uses `rfc8785` (JCS) and `cryptography` (Ed25519), so a bug
in the TypeScript implementation cannot hide behind a copy of itself.

```
python -m pip install -r requirements.txt

# verify one envelope
python verify_envelope.py --envelope envelope.json --public-key <base64>

# run the shared conformance vectors
python verify_envelope.py --vectors ../../conformance/vectors.json

# verify a real exported evidence bundle (G1 envelopes + registry)
python verify_bundle.py --bundle fixtures/g1-exported-bundle.json
```

Failure reasons match the SDK: `malformed`, `unsupported_version`, `event_hash_mismatch`, `bad_signature`.

`verify_bundle.py` additionally checks receipt sequence continuity and that each
source key in `source_registry` was valid at the envelope's recorded `ts`.

This is a Python tool, not a pnpm package (no `package.json`).
