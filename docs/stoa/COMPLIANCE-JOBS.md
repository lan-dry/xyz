# Stoa compliance jobs

## Scheduled data retention

Retention deletes messages, empty threads, and orphan attachments when **Enforce retention** is enabled in **Admin → Compliance**.

### Per-tenant schedule

1. Enable **Run daily scheduled retention (UTC)**.
2. Set **Scheduled UTC hour** (0–23). The job runs once per tenant per UTC calendar day during that hour.

### Option A — in-process scheduler (single API instance)

Set on `stoa-api`:

```env
STOA_RETENTION_SCHEDULER=1
# optional, default 900000 (15 minutes)
STOA_RETENTION_SCHEDULER_INTERVAL_MS=900000
```

The API process checks the UTC hour on each interval and runs eligible tenants.

### Option B — external cron (recommended for production)

Call the internal endpoint hourly (or at least during your configured UTC hours):

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $STOA_CRON_SECRET" \
  "https://your-stoa-api.example/v1/stoa/internal/jobs/retention"
```

Force all eligible tenants regardless of hour (maintenance):

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $STOA_CRON_SECRET" \
  "https://your-stoa-api.example/v1/stoa/internal/jobs/retention?force=1"
```

Or run from the monorepo (runs migrations first):

```bash
pnpm --filter stoa-api retention:scheduled
pnpm --filter stoa-api retention:scheduled -- --force
```

### Environment

| Variable | Purpose |
|----------|---------|
| `STOA_CRON_SECRET` | Bearer token for `POST /v1/stoa/internal/jobs/retention` |
| `STOA_RETENTION_SCHEDULER` | `1` to enable in-process scheduler |
| `STOA_EXPORT_SIGNING_SECRET` | Default HMAC secret for signed audit bundles |

## Signed audit bundles

**Admin → Compliance → Download signed audit bundle** returns JSON:

- `manifest` — export metadata and `contentSha256` of the events array
- `signature` — `HMAC-SHA256(manifest, secret)` as hex
- `events` — audit rows (respecting admin mask policy)

Verify offline by recomputing the HMAC over the canonical JSON of `manifest`. Per-tenant override: **Export signing secret** in Compliance settings.

## SIEM streaming

When **Stream each audit event to SIEM in real time** is enabled, `stoa-api` POSTs `type: "audit.event"` payloads to the configured webhook (same signing headers as retention notifications).
