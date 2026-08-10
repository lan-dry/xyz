# Aegis P0 — local hot-path micro-benchmark

Run on your machine (Windows PowerShell example):

```powershell
cd d:\PROJECTS\salanor
pnpm aegis:bench
```

## Sample output (laptop-class hardware, indicative)

```
Aegis local hot path (10000 events)
  record: 0.05–0.15 ms/event
  replay: < 50 ms (10000 events)
  verify: < 80 ms (10000 events)
```

## Interpretation

P0 targets **negligible SDK overhead** relative to future collector/bus/ledger risk (see `IMPLEMENTATION_PLAN.md` critical-path risks). Local NDJSON append + SHA-256 chaining is intentionally simple; cloud paths (P3+) add network and persistence latency dominated by infrastructure, not this slice.

Record numbers vary by disk and antivirus; use relative comparisons across commits, not absolute SLOs.
