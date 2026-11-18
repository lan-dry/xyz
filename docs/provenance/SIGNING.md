# AEGIS-SRC1 signing algorithm

AEGIS-SRC1 is how a source system (loan system, core banking adapter, collector) proves to Aegis that a
business event came from it and was not changed on the way. It is **not** APS-1 (which Aegis uses for its
own sealed decisions). Reference implementation: `packages/aegis-sdk`. Independent check:
`tools/independent-verify/verify_envelope.py`. Shared test vectors: `conformance/vectors.json`.

## 1. The envelope

```json
{
  "aegis_envelope": "1",
  "source_id": "src_los",
  "key_id": "k_los_2026_01",
  "seq": 1,
  "ts": "2026-11-18T10:01:22.123Z",
  "nonce": "AAECAwQFBgcICQoLDA0ODw",
  "idempotency_key": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "event": { "type": "loan.approved", "loan_id": "LN-0001" },
  "event_hash": "9bd508c622d87a9b0af7a20ec625efb8a4834c689ef94bb920bd8a02ebe061c5",
  "signature": "ejK7wtnElJBJNFZPyEderRBgG5fGMArvgc3B3TwEskYD6mymNnSvyST5ljSaNG2HiMUJhACztPrZsNDZmBZ6CQ"
}
```

Exactly these ten fields. Unknown fields make the envelope `malformed`.

| Field | Rule |
| --- | --- |
| `aegis_envelope` | The string `"1"`. |
| `source_id` | `^[A-Za-z0-9._:-]{1,128}$`. The registered source. |
| `key_id` | Same pattern. A key registered **to that source** (key ids are unique per organisation). |
| `seq` | Positive safe integer (1 .. 2^53-1). Per source, assigned by the sender. |
| `ts` | UTC, millisecond precision, exactly `YYYY-MM-DDTHH:MM:SS.mmmZ`. |
| `nonce` | base64url (no padding) of 16 random bytes, unique per source. |
| `idempotency_key` | A UUID. Reuse it when re-sending the same envelope. |
| `event` | JSON object (see 2). For `/v1/aegis/source-events` it must also be a valid decision request. |
| `event_hash` | 64 lowercase hex characters, see 3. |
| `signature` | base64url (no padding) of 64 bytes, see 4. |

## 2. Event value domain

Allowed: `null`, booleans, strings (no lone surrogates), **safe integers**, arrays, plain objects.
Not allowed: floats, `NaN`/`Infinity`, `undefined`, `bigint`, class instances. Money and any fractional
amount is a **decimal string**, for example `"1234.50"`.

## 3. Canonical JSON and the event hash

Canonical JSON is **RFC 8785 (JCS)**: object keys sorted by UTF-16 code unit, no insignificant whitespace,
ECMAScript number formatting, minimal string escaping. Output is UTF-8.

```
event_hash = lowercase_hex( SHA-256( UTF8( JCS(event) ) ) )
```

For the example above `JCS(event)` is `{"loan_id":"LN-0001","type":"loan.approved"}`.

## 4. The signature

1. Remove `signature` from the envelope (every other field stays, including `event` and `event_hash`).
2. Canonicalize what is left with JCS.
3. Build the signing text, with a single `\n` (0x0A) between the parts and **no** trailing newline:

   ```
   "AEGIS-SRC1\n" + source_id + "\n" + key_id + "\n" + JCS(envelope without signature)
   ```

4. `digest = SHA-256( UTF8(signing text) )` (32 bytes).
5. `signature = Ed25519_sign( privateKey, digest )`: pure Ed25519 (RFC 8032) over the 32 digest bytes as the
   message (not Ed25519ph, no extra context). The 64-byte result is base64url-encoded without padding.

The `AEGIS-SRC1\n` prefix is domain separation: a signature made for another purpose with the same key can
never be valid here. `source_id` and `key_id` are repeated outside the JSON so the signer commits to which
source and key it speaks for.

Worked example (test-only key from `conformance/vectors.json`, `minimal-ascii`):

```
signature_input_hash = 7cea331ac5b53117de5dec241c26ceb3f270755f4b0bcf95cd7906045545f42d
public_key_b64       = 0EqyMnQrtKs6E2i9RhXk5tAiSrcaAWuvhSCjMsl3hzc=
```

## 5. Keys

- Ed25519, 32-byte seed (private) and 32-byte public key.
- Register the **public** key with Aegis as **standard base64, padded** (44 characters). The Console and
  `POST /v1/console/sources` reject anything that does not decode to exactly 32 bytes in canonical form.
- The private key never leaves the source. Aegis stores and shows only the public key (the Console shows a
  fingerprint: first 8 and last 8 base64 characters).

## 6. What Aegis checks, in order

`POST /v1/aegis/source-events` (also used when `POST /v1/aegis/governed/events` receives `aegis_envelope: "1"`).
Ingest key authentication comes first (401 `Invalid API key`). Then, for the envelope:

| # | Check | Rejection (`code`) | HTTP |
| --- | --- | --- | --- |
| 1 | `aegis_envelope` is `"1"` | `unsupported_version` | 400 |
| 2 | `source_id` and `key_id` present | `malformed` | 400 |
| 3 | `key_id` exists in this organisation | `unknown_key` | 401 |
| 4 | That key belongs to `source_id` | `key_source_mismatch` | 401 |
| 5 | Shape valid (`malformed`), `event_hash` matches `JCS(event)`, Ed25519 verifies against the registered public key (strict, non-ZIP215) | `malformed`, `event_hash_mismatch`, `bad_signature` | 400 / 401 |
| 6 | **Under the per-source lock:** an already accepted envelope with the same `idempotency_key` and `event_hash` returns its **stored response** (200), even if the key was revoked since. Same key with a different event or source is refused | `idempotency_conflict` | 409 |
| 7 | Source is `active` | `source_disabled` | 403 |
| 8 | Key status is `active` (not `revoked`, not `rotated`) | `key_revoked`, `key_inactive` | 401 |
| 9 | `valid_from <= ts < valid_to` (`valid_to` may be empty) | `key_not_yet_valid`, `key_expired` | 401 |
| 10 | `abs(server_now - ts) <= AEGIS_SOURCE_TS_SKEW_SEC` (default 300) | `timestamp_skew` | 400 |
| 11 | `nonce` not seen for this source | `nonce_reused` | 409 |
| 12 | Sequence rule (below) | `seq_replay` | 409 |
| 13 | `event` parses as a decision request | `validation_error` | 400 |

Rejected envelopes change nothing (no nonce, no sequence, no idempotency row).

### Sequence rule

The lock is a Postgres advisory lock named `<organization_id>:source_seq:<source_id>`, held until the
decision, receipt and registry updates are committed. With `last` = the source's `last_seq`:

| `seq` | Result |
| --- | --- |
| `last + 1` | Accepted. `last_seq = seq`. |
| `> last + 1` | Accepted. A **gap** `[last+1, seq-1]` is recorded and shown in the Console. `last_seq = seq`. |
| `<= last` and inside a recorded gap | Accepted as a late arrival (it was never accepted before). The gap shrinks or closes; `last_seq` is unchanged. |
| `<= last` otherwise | Rejected as a replay (`seq_replay`). |

The gap-filling row is the one deliberate refinement of "`seq <= last` is a replay". Without it, parallel
senders that deliver out of order would permanently lose events.

## 7. What is stored (Stage 1, grade G1)

On success the inner `event` runs through the normal decision path and the **full envelope, including the
signature,** is written into the attributes of both the sealed APS-1 event and the forensic receipt:

```json
{
  "source_envelope": { "...": "the envelope exactly as received" },
  "source_id": "src_los",
  "source_key_id": "k_los_2026_01",
  "evidence_grade": "G1",
  "checks": { "source_signed": true },
  "provenance": { "authentication": "source_signature", "grade": "G1" }
}
```

The response is the usual decision JSON plus `"source_signed": true` and `"evidence_grade": "G1"`.

If the organisation's field policy hides any attribute of the event, the `event` inside the stored envelope
is replaced by `{ "redacted_by_field_policy": true }` so masked values cannot leak through the envelope. The
signature and `event_hash` are kept. Stage 2 should decide how to keep such envelopes verifiable.

## 8. Registry history

Every registry change is appended to `source_registry_event` (`registered`, `key_added`, `key_rotated`,
`key_revoked`, `source_disabled`) with actor, key id and detail (for example the revocation reason). It is
available at `GET /v1/console/sources/:sourceId/history` and is meant for evidence bundles.
