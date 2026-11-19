# AEGIS-SRC1 conformance

`vectors.json` holds cross-language test vectors for AEGIS-SRC1 source envelopes
(15 positive, 12 negative). **All keys in it are test-only, publicly published seeds
(32 repeated bytes). Never use them for anything real.**

Each positive vector has `test_only_private_key_b64`, `public_key_b64`,
`envelope_without_signature`, `event_jcs`, `canonical_envelope_jcs` (+ UTF-8 hex),
`event_hash`, `signature_input_hash` and `signature_b64url`. Negative vectors give a full
envelope plus the expected failure `reason`.

```
pnpm --filter @salanor/aegis-sdk build
python -m pip install -r tools/independent-verify/requirements.txt

node conformance/run.mjs                  # reproducibility check + TypeScript SDK + Python verifier
node conformance/run.mjs --skip-python    # TypeScript only
node conformance/generate-vectors.mjs     # regenerate vectors.json (deterministic)
```

Set `AEGIS_PYTHON` to choose the Python interpreter. The same vectors are also exercised by
`pnpm --filter @salanor/aegis-sdk test`.
