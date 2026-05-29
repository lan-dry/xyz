# github.com/salanor/salanor-go/aegis

Go client for APS-1 event signing, ingest, and public transparency verification.

**MVP scope:** `SignEvent`, `SignAndIngest`, `IngestSigned`, public bundle verify. Runtime policy proxy (`wrapFetch`) is **TypeScript-only** — call `POST /v1/aegis/policy/evaluate` from Go or use `@salanor/aegis` in Node.

```go
signed, err := aegis.SignEvent(event, privateKeyB64, "key_…")
result, err := aegis.SignAndIngest(event, privateKeyB64, "key_…", aegis.IngestOptions{
    APIBaseURL:   "https://api.salanor.com",
    IngestAPIKey: os.Getenv("AEGIS_INGEST_API_KEY"),
})
bundle, err := aegis.FetchPublicBundle("https://api.salanor.com", "acme", eventID)
check := aegis.VerifyPublicBundle(bundle)
```

Module path: `github.com/salanor/salanor-go/aegis` (sources in monorepo `salanor-go/aegis/`).
