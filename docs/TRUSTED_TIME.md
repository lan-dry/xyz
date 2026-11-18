# Trusted time (RFC 3161)

A receipt is signed with our key and carries our clock. That proves *what* we
signed, but not *when* to a party who does not trust our clock. An RFC 3161
timestamp from an outside Time-Stamping Authority (TSA) over the receipt hash
fixes that: the TSA signs "this hash existed at this time".

## Choice of TSA

**Default recommendation: Sectigo public TSA, `http://timestamp.sectigo.com`.**

Why:

- Run by a commercial public CA that is audited under the CA/Browser Forum baseline and WebTrust regimes, with a long operating history (it timestamps code signatures on Windows and Java).
- Free, no account, no API key, plain HTTP POST of `application/timestamp-query`.
- SHA-256 imprints are supported (we send SHA-256).
- Its certificate chain is published, so anyone can verify a token offline.

Alternatives: FreeTSA (`https://freetsa.org/tsr`) is fine for trials but is a
volunteer service with no availability commitment; DigiCert
(`http://timestamp.digicert.com`) is equivalent in standing. Switching is only
`AEGIS_TSA_URL` (and optionally `AEGIS_TSA_NAME`); old stamps keep the URL and
authority they were issued under.

Caveats you should tell a customer:

- A public free TSA has **no SLA**. That is why stamping never blocks issuing a receipt (below).
- The HTTP endpoint is not encrypted. That is acceptable: the request is a hash, and the reply is a signed token whose integrity does not depend on transport. For a paid TSA, use its HTTPS endpoint.
- Trust in the stamp is trust in the TSA's certificate chain. Verifying that chain is an offline step (below).

## Configuration

| Env | Meaning |
|-----|---------|
| `AEGIS_TSA_URL` | RFC 3161 endpoint. Unset: no outside stamp; receipts carry signing time only, and production boot logs a warning. |
| `AEGIS_TSA_NAME` | Display name. Default is derived from the host (`timestamp.sectigo.com` shows as "Sectigo"). |
| `AEGIS_TSA_RETRY_INTERVAL_SECONDS` | How often the retry loop wakes (default 15, minimum 5). |

## How it works

Code: `src/forensic/tsa.ts`, `src/forensic/receipt-timestamp.ts`, `src/forensic/rfc3161.ts`, table `forensic_receipt_timestamp`.

1. `issueForensicReceipt` signs and stores the receipt, and inserts a `pending` timestamp row in the same transaction. **The receipt is issued whether or not the TSA is reachable.**
2. A background loop in the API process leases due rows (`FOR UPDATE SKIP LOCKED`, safe with several API instances), sends the SHA-256 `receipt_hash` as the message imprint, and parses the reply.
3. On success the row becomes `stamped` with the authority, `genTime`, and the raw token (base64). On failure it stays `pending` and is retried with exponential backoff, 15 seconds up to 1 hour.
4. The stamp is stored **outside** the signed receipt body (receipts are append-only and already signed).

The evidence bundle's `trusted_time` is **re-derived by the verifier from the
token**, not taken from our word: the imprint in the token must equal the
receipt hash and `genTime` must match the stated time.

| State | Meaning | UI |
|-------|---------|----|
| stamped | Token valid for this receipt | green: "Trusted time: Sectigo at 2026-11-16 05:40:41 UTC" |
| pending | Not stamped yet (TSA down or still queued) | **amber**: "Trusted time: pending". Never green. |
| invalid | Token present but imprint or time does not match | red: "Trusted time: stamp does not match this record", finding `timestamp_invalid` |
| not configured | `AEGIS_TSA_URL` unset | "Trusted time: not stamped by an outside authority (signing time only)" |

## What we do not do

The API parses status, `genTime` and the message imprint. It does **not** verify
the CMS signature or the TSA certificate chain in process. Do that offline when
it matters:

```
openssl ts -verify -in token.tsr -digest <receipt_hash_hex> -sha256 \
  -CAfile <tsa-root-and-intermediates.pem>
```

Take the token from the evidence bundle (`trusted_time[].token_b64`, base64 of
the DER reply from the TSA; decode it into `token.tsr`) and the TSA's published
chain. If your `openssl` version expects a bare token rather than a full reply,
add `-token_in`. Treat this
as a known gap until in-process CMS verification is added.

## Operations

- `/ready` reports `checks.tsa` (configured, authority, reachable, `pending_timestamps`). An unreachable TSA is a **warning** (`tsa_unreachable`), not a failure, because receipts still issue.
- A growing `pending_timestamps` for more than a few hours means the TSA is down or blocked by egress rules. Check outbound access to the TSA host on port 80.
- Rate: one request per receipt. If volume ever exceeds a public TSA's courtesy limits, batch by stamping the witness checkpoint instead, or move to a paid TSA.

## Witness roots (A5)

Every Merkle witness root is also timestamped with the same TSA (`AEGIS_TSA_URL`),
reusing `requestReceiptStamp` / `createCheckpointTimestamp`. The token is stored on
`merkle_root` (`tsa_token_b64`, authority, genTime). When no TSA is configured, a
local-test token is stored so evidence bundles remain offline-complete in
dev/tests.

Product wording: **Salanor witness checkpoint (signed)** unless
`anchoring_type` is external (bitcoin / ethereum).

### Merkle hashing rule

- **Leaf:** the event hash (`event.event_hash`) used verbatim.
- **Internal node:** SHA-256 of the left hex string followed by the right hex string
  (UTF-8 concatenation): `SHA-256(left + right)`.
- Inclusion proofs, root signatures, and the timestamp token ship in every evidence
  bundle; `aegis-verify` checks inclusion offline.
