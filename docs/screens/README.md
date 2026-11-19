# Console projector screens

Capture after `pnpm demo:up` (Demo Bank + `bank_demo` profile).

```powershell
pnpm demo:up
pnpm demo:screens
```

Writes 1920×1080 PNGs (and `*-zoom125.png` variants) under this folder:

| File | Page |
|------|------|
| `01-overview.png` | Overview |
| `02-live-feed.png` | Live feed |
| `03-approvals.png` | Approvals |
| `04-rules.png` | Rules / policies |
| `05-simulator.png` | Bank simulator |
| `06-verify.png` | Verify |
| `07-reports.png` | Reports |
| `08-access-log.png` | Access log |

| `approvals-ui/` | Hard-stop **Release** modal + PAY-03 callback checkbox (`tmp/capture` after raising simulator stories) |
| `menu/` | Full bank_demo nav walk (`pnpm demo:full-menu`) |

Manual extras for the pitch (officer refusal, manager approve, held-then-released case, tampered bundle): capture while walking `docs/DEMO_RUNBOOK.md`.

Last updated: production-style P0/P7 screens — `pnpm demo:screens`, `pnpm demo:full-menu`, approvals-ui Release/callback.
