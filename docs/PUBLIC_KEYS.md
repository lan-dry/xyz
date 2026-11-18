# Published receipt signing keys

Stable, public endpoints for Aegis receipt verification keys (public material only).

## URLs

| Environment | URL |
|-------------|-----|
| Production | `https://api.salanor.com/v1/public/keys` |
| Production (alias) | `https://api.salanor.com/v1/public/keys.json` |
| Local API | `http://127.0.0.1:8088/v1/public/keys` |

Each entry includes:

- `key_id`
- `alg` (`ed25519`)
- `public_key_b64` (raw 32-byte public key, base64)
- `fingerprint` (`sha256:…`)
- `custody` / `custody_label` (AWS KMS vs software / interim)
- `status` (`active` or `retired`)
- `created_at` / `retired_at`

Retired keys stay listed so **old evidence bundles keep verifying**.

## Pinning

Publish the fingerprint out of band (contract, board pack, or this docs page after go-live). When verifying:

1. Fetch `/v1/public/keys` (or use `keys.json` from a trusted copy).
2. Confirm the bundle’s key id and fingerprint match.
3. Run offline `aegis-verify` — see `tools/aegis-verify/README.md`.

Do not trust a public key that appears only inside a bundle if it is not also published here or in `receipt_signing_key`.

## Offline tool

```bash
pnpm aegis-verify:pack
# → tools/aegis-verify/dist/aegis-verify/
```

Also: `pnpm aegis-verify <bundle.json> --keys keys.json` from the monorepo.
