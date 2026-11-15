# Production TSA + managed KMS Sign

## RFC 3161 TSA

| Env | Purpose |
|-----|---------|
| `AEGIS_TSA_URL` | HTTP endpoint accepting `application/timestamp-query` (RFC 3161). When set, checkpoints use `requestRfc3161Timestamp`. When unset, local test HMAC TSA is used (dev/tests only). |

Client: `services/aegis-api/src/forensic/rfc3161.ts` (`buildRfc3161TimestampRequest`, `requestRfc3161Timestamp`, `createCheckpointTimestamp`).

## KeyProvider Sign

| Provider | Env / credentials | Behaviour |
|----------|-------------------|-----------|
| `AwsKmsKeyProvider` | AWS default credential chain | `kms:Sign` ED25519 |
| `GcpKmsKeyProvider` | `GCP_KMS_ACCESS_TOKEN` | Cloud KMS `asymmetricSign` |
| `VaultKeyProvider` | `VAULT_ADDR` + `VAULT_TOKEN` | Transit `sign` |
| `LocalFileKeyProvider` | Dev only | Refuses `NODE_ENV=production` |
| `EnvSecretKeyProvider` | `AEGIS_RECEIPT_SIGNING_KEY_B64` | Local Ed25519 |

Event signing path (`signApsEventWithKey`) already routes `kms_provider` aws/gcp/vault. Providers fail clearly when credentials are missing.
