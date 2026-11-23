# Stage 2 report — sandbox tenant type

| Item | Status |
|------|--------|
| Migration `016_sandbox_tenant.sql` | **Done** |
| Server enforcement (no promote, synthetic guard) | **Done** |
| Expiry worker + emails | **Live (captured)** — housekeeping tick + `pnpm launch:sandbox-expiry`; vitest writes `_raw/sandbox-expiry-email-test.json` |
| Ops sandboxes pages | **Done** |
| Reset sandbox + wipe rules | **Done** (sandbox wipeable; real refused) |

## Notes

- Emails are **captured to disk** when `SANDBOX_EXPIRY_EMAIL_CAPTURE_DIR` is set (tests/CI). Live Resend/SMTP delivery still depends on platform email settings (founder).
