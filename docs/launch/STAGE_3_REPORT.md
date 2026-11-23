# Stage 3 report — sign-up with approval

| Item | Status |
|------|--------|
| Public `POST /v1/public/access-request` | **Done** (work email, honeypot, rate limit) |
| Ops queue approve / reject | **Done** |
| Approve creates sandbox org | **Done** |
| Invite email + Resend verify | **Not done live** — create org returns instruction; Resend corporate/Gmail test not run |
| `SIGNUP_MODE=approval\|open` | **Done** (env) |

## Honesty

Email verification before first sign-in and live inbox tests: **not done**.
