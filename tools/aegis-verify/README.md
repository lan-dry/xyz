# aegis-verify

Offline checker for Aegis evidence bundles (signed receipts + sealed event refs + optional witness inclusion).

## Download (single folder)

From the repo root:

```bash
pnpm aegis-verify:pack
```

That writes `tools/aegis-verify/dist/aegis-verify/` with:

- `cli.mts` / `merkle.ts` — verifier sources
- `run.mjs` — entrypoint (`node run.mjs …`)
- `package.json` — `@noble/ed25519` + `tsx` (install once)
- `README.md` — this file
- `keys.example.json` — shape of the public-keys file

Zip that folder and hand it to an auditor. No monorepo required.

## Public keys (stable URL)

Published signing public keys and fingerprints:

- Production: `https://api.salanor.com/v1/public/keys` (also `/v1/public/keys.json`)
- Local: `http://127.0.0.1:8088/v1/public/keys`

Save the response (or the `keys` map from an evidence bundle) as `keys.json`. Pin the fingerprint out of band — see `docs/KEY_CUSTODY.md` and `docs/PUBLIC_KEYS.md`.

## Offline verify

```bash
cd tools/aegis-verify/dist/aegis-verify
npm install --omit=dev
node run.mjs path/to/evidence-bundle.json --keys keys.json
```

Exit code `0` and `ok: true` means the file verifies. Tampering any sealed field must fail.

## Tests

```bash
pnpm --filter @salanor/aegis-verify test
```

Merkle inclusion is covered offline without a network.
