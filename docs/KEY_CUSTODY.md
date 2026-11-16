# Key custody

Aegis uses two kinds of signing keys. They have different custody. Read the
limitations section before making claims to a customer or auditor.

| Key | Signs | Where the private key lives | Custody label |
|-----|-------|-----------------------------|---------------|
| **Receipt key** | Forensic receipts (`AEGIS-RECEIPT1`) | AWS KMS, never exported (Plan A) | `kms` |
| Receipt key, interim | Forensic receipts | Process environment (Plan B, explicit opt-in) | `software_interim` |
| **Agent seal key** (APS) | Governed-decision events (`sealGovernedDecision`) | Encrypted in Postgres, or a provider (aws / gcp / vault) | see below |

## Receipt key (forensic receipts)

### Plan A: AWS KMS Ed25519 (production default)

Exact AWS names. Do not substitute.

| Setting | Value |
|---------|-------|
| KeySpec | `ECC_NIST_EDWARDS25519` |
| KeyUsage | `SIGN_VERIFY` |
| SigningAlgorithm | `ED25519_SHA_512` |
| MessageType | `RAW` (pure Ed25519, FIPS 186-5 section 7.6). **Not** `ED25519_PH_SHA_512`. |

How a receipt is signed (`src/forensic/receipt.ts`, `src/crypto/kms-ed25519.ts`):

1. `digest = SHA-256("AEGIS-RECEIPT1\n<key_id>\n<canonical_payload>")` (32 bytes).
2. Software path: noble `ed25519.sign(digest, seed)`. Ed25519 hashes the message with SHA-512 internally.
3. KMS path: `Sign { Message: digest, MessageType: "RAW", SigningAlgorithm: "ED25519_SHA_512" }`. The same 32 digest bytes go in as the raw message, so the signature is identical in form and verifies with the published public key in `aegis-verify`.
4. After signing, the API verifies the signature against the KMS public key. A mismatch (wrong key, wrong algorithm) fails closed and no receipt is issued.

The public key is read once with `GetPublicKey`. The 32-byte Ed25519 key is the
tail of the SPKI DER; the 12-byte prefix `30 2a 30 05 06 03 2b 65 70 03 21 00`
is checked and stripped. Any other prefix or length is rejected.

The key custody is signed into the receipt body (`flags.key_custody`: `kms` or
`software_interim`), so it cannot be changed after the fact.

### Plan B: interim software key

`AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim` plus `AEGIS_RECEIPT_SIGNING_KEY_B64`
(32-byte seed). Only that exact value is accepted. Receipts and Verify then show
**"Key custody: software key (interim)"** and the boot log warns. This exists so
a deployment is not blocked while KMS is being provisioned; it is not a
long-term position. Anyone who can read the process environment can forge
receipts under that key.

Without KMS and without the interim flag, `AEGIS_ENV=production` refuses to
boot (`src/boot/production-guards.ts`).

### Publishing the key

- `GET /v1/public/keys` (also `/v1/public/keys.json`): every receipt key id, public key, fingerprint, custody, status, `created_at` / `retired_at`. Retired keys stay listed.
- Evidence bundles carry the key id, public key, and custody for the receipts they contain. `keys.json` in a bundle export has the same shape.
- The `receipt_signing_key` table (migration 019) stores the public side only. In production a given `key_id` maps to one public key forever; issuing under the same id with a different key is refused.
- When verifying a bundle, the API only trusts a key if it is the configured receipt key or a key published in `receipt_signing_key`; a key carried only inside the bundle is not trusted on its own. Publish the fingerprint **out of band** (website, contract, board pack) so an attacker who controls the API cannot swap both.

### Rotation and retirement

Rotation (planned, or after a suspected exposure):

1. Create a new KMS key. Do not reuse or "rotate" the old key in place; KMS automatic rotation does not apply to asymmetric keys.
2. Run `pnpm smoke:kms` against the new key.
3. Set `AEGIS_RECEIPT_KMS_KEY_ID` and a **new** `AEGIS_RECEIPT_KEY_ID` (for example `receipt_prod_2027`). Deploy. The new public key is published on first use.
4. Retire the old key in `receipt_signing_key` (`retireReceiptSigningKey` in `src/repo/receipt-keys.ts`). It sets `status = 'retired'` and `retired_at`; the row stays so old receipts verify.
5. Verification uses the published public key, not KMS, so the old KMS key is not needed to verify history. After retirement, remove the old key from the role's policy. Export and archive its public key before scheduling deletion (KMS minimum waiting period is 7 days), and do not delete it until your retention period ends.

If a key is believed compromised, retire it immediately, record the time, and
treat receipts signed after the suspected exposure time as unproven. Receipts
before it remain valid because they are also anchored in the witness chain and
carry an outside RFC 3161 time (see `TRUSTED_TIME.md`).

### Least privilege

`docs/kms-iam-policy.json`. Only `kms:Sign` and `kms:GetPublicKey`, on the one
key ARN. Attach it to the API's task or instance role. No `kms:DescribeKey`,
no `kms:ScheduleKeyDeletion`, no wildcard resource. Administrators of the key
should be a separate role that cannot sign.

### Audit trail (CloudTrail)

Every `Sign` and `GetPublicKey` call is logged by CloudTrail as a management
event for KMS (`eventSource: kms.amazonaws.com`, `eventName: Sign`). Turn on a
trail that delivers to a separate, write-restricted account or bucket, and
alert on `Sign` calls from any principal other than the API role, and on
`DisableKey`, `ScheduleKeyDeletion`, `PutKeyPolicy`. CloudTrail does not record
the message signed, only that a signature was made; compare Sign counts with the
receipt count as a periodic check.

## Agent seal keys (APS)

Source: `src/bank/seal-decision.ts`, `src/crypto/signing-provider.ts`,
`src/crypto/bridge-key-vault.ts`, table `signing_key`.

`sealGovernedDecision` picks an active, non-revoked `signing_key` for the agent
and signs the governed-decision event. How the private key is held depends on
the row:

| `signing_key` row | Private key |
|-------------------|-------------|
| `private_key_ciphertext` set | Ed25519 private key encrypted in Postgres with **AES-256-GCM**, format `v1.<iv>.<tag>.<ciphertext>`, random 12-byte IV, authenticated. The wrapping key is `AEGIS_BRIDGE_MASTER_KEY` (32 bytes, base64 or hex; any other string is hashed with SHA-256 into a key). |
| `kms_provider = aws` / `gcp` / `vault` | Held by that provider; Aegis calls Sign. Credentials come from the provider's usual environment. |
| `kms_provider = dev` | Local file or env key (`AEGIS_SIGNING_KEY_FILE`, `DEV_SIGNING_PRIVATE_KEY_B64`). Development only. |

### Limitations (be honest about these)

- **The master key is an environment secret.** Anyone who can read the API environment *and* the database can decrypt every agent seal key. Encryption at rest protects database backups and a database-only leak, not a compromised API host.
- A single master key wraps all agents' keys. There is no per-key wrapping, no key id in the ciphertext, and no re-wrap tool, so rotating `AEGIS_BRIDGE_MASTER_KEY` means re-encrypting every row by hand.
- A passphrase-style master key is hashed once with SHA-256, not stretched. Use a random 32-byte value.
- Decrypted keys exist in process memory while signing.
- Agent seal keys prove which governed agent identity sealed a decision. They are **not** the receipt key, and they are not protected by KMS unless the row uses `kms_provider = aws`.
- The witness checkpoint key (transparency log) is still a software key.
- The production guard only warns when `AEGIS_BRIDGE_MASTER_KEY` is unset; Approve/Reject and Workflow Bridge keys then do not work.

Recommended path: move agent seal keys to `kms_provider = aws` (the existing
`AwsKmsKeyProvider` already calls `Sign`), keep `AEGIS_BRIDGE_MASTER_KEY` only
for legacy rows, and retire ciphertext rows as agents rotate.

## Never print secrets

Logs, `/ready`, `smoke:kms`, and guard errors name the env var and the problem
only. They never print seeds, master keys, ARNs, account ids or credentials.
Keep it that way in any new code and in support requests.
