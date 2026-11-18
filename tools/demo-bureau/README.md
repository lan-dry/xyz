# Demo Credit Bureau (Stage 7 stub)

Minimal third-party signer for provenance demos.

```bash
pnpm --filter @salanor/demo-bureau start
curl -s http://127.0.0.1:4100/v1/keys
curl -s -X POST http://127.0.0.1:4100/v1/score \
  -H 'content-type: application/json' \
  -d '{"subject_id":"LN-1","credit_score":612}'
```

Register the returned `public_key_b64` in Aegis as a source with `kind=third_party`.
The LOS forwards `envelope` in the governed event as `attributes.third_party_facts: [envelope]`.
