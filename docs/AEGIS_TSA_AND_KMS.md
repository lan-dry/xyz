# Production TSA + managed KMS Sign

Current production guidance lives in:

- [`KEY_CUSTODY.md`](KEY_CUSTODY.md): AWS KMS Ed25519 receipt key, interim software key, APS agent seal keys, rotation, CloudTrail, IAM policy ([`kms-iam-policy.json`](kms-iam-policy.json)).
- [`TRUSTED_TIME.md`](TRUSTED_TIME.md): choice of public TSA (Sectigo), per-receipt stamping with retry, what is and is not verified.

The notes below describe the lower-level providers.

## RFC 3161 TSA

| Env | Purpose |
|-----|---------|
| `AEGIS_TSA_URL` | HTTP endpoint accepting `application/timestamp-query` (RFC 3161). When set, forensic receipts and Merkle witness roots use `requestRfc3161Timestamp` / `requestReceiptStamp`. When unset, local test HMAC TSA is used (dev/tests only). |

Client: `services/aegis-api/src/forensic/rfc3161.ts` (`buildRfc3161TimestampRequest`, `requestRfc3161Timestamp`, `createCheckpointTimestamp`). Witness roots: `services/aegis-api/src/witness/root-timestamp.ts` (stores `tsa_token_b64` on `merkle_root`).

## KeyProvider Sign

| Provider | Env / credentials | Behaviour |
|----------|-------------------|-----------|
| `AwsKmsKeyProvider` | AWS default credential chain | `kms:Sign` ED25519 |
| `GcpKmsKeyProvider` | `GCP_KMS_ACCESS_TOKEN` | Cloud KMS `asymmetricSign` |
| `VaultKeyProvider` | `VAULT_ADDR` + `VAULT_TOKEN` | Transit `sign` |
| `LocalFileKeyProvider` | Dev only | Refuses `NODE_ENV=production` |
| `EnvSecretKeyProvider` | `AEGIS_RECEIPT_SIGNING_KEY_B64` | Local Ed25519 |

Event signing path (`signApsEventWithKey`) already routes `kms_provider` aws/gcp/vault. Providers fail clearly when credentials are missing.
