# Operations — alerts and what to do

One page for on-call. Alerts come from `/ready` probes and optional `ALERT_WEBHOOK_URL` / `ALERT_EMAIL_TO`.

## Alert: database down

**Meaning:** API cannot reach Postgres.  
**Do:** Check Neon/Railway DB status, connection string, IP allow list. Do not restart witness alone — fix DB first. `/ready` returns 503.

## Alert: witness stale / failure

**Meaning:** Witness worker heartbeat older than `AEGIS_WITNESS_MAX_AGE_MINUTES`, or last Merkle batch too old.  
**Do:** Check `aegis-witness` logs and deploy. Confirm `WITNESS_CHECKPOINT_PRIVATE_KEY_B64` / KMS. Cases stay sealed; inclusion stays pending until flush succeeds.

## Alert: queue lag (TSA pending stamps)

**Meaning:** Many receipts waiting for RFC 3161 stamps.  
**Do:** Check TSA reachability in `/ready` `checks.tsa`. Receipts still issue; stamps catch up. If TSA is intentionally off, treat as warning only.

## Alert: certificate expiry

**Meaning:** Public TLS cert for api / id / app nearing expiry (external monitor).  
**Do:** Renew at Railway/Vercel/DNS. Not an Aegis data integrity issue.

## Alert: KMS errors

**Meaning:** `GetPublicKey` / sign failed against `AEGIS_RECEIPT_KMS_KEY_ID`.  
**Do:** Check AWS region, IAM, key state. With `REQUIRE_MANAGED_KEY=true` the API will not fall back to software keys — fix KMS before new seals.

## Alert: high error rate (5xx)

**Meaning:** Spike in failed requests.  
**Do:** Check recent deploy, DB, and ingest rate limits (429 is expected under abuse — not a 5xx).

## `/ready` fields

- `checks.database` — must be ok  
- `checks.witness` — worker + batch age  
- `checks.tsa` — warning if unreachable  
- `checks.signing_key` — custody + KMS reachability  
