# Stranger test (human)

Hand this to someone who has never used Salanor.

## What to give them

- Link to request-access form (`POST /v1/public/access-request` UI when published, or Ops-created invite)
- Work email they control
- Laptop with Chrome

## What to say

“Sign up for a sandbox, send a test event, open the sealed case, download the evidence file, and check it on the Verify page. Then invite a colleague as auditor.”

## What to write down

1. Could they request access without help?  
2. After approve, could they sign in?  
3. Did the checklist make sense?  
4. Did Verify pass on a real bundle?  
5. Could the auditor open cases but not approve?  
6. Where did they get stuck?

## Founder after-action

Attach notes under `docs/launch/_raw/stranger-human-YYYYMMDD.md` for a human UI walk.

## Automated path (CI / local)

```bash
pnpm launch:stranger
```

Release blocker in **quality-gate**. Covers:

1. Public access-request (work email)
2. Ops approve → invite URL
3. `signup-accept` (set password — no SQL bypass)
4. Create API key, Test sender (routine + held), open sealed receipt, approve held
5. Download evidence bundle + `aegis-verify`
6. Invite colleague (auditor)
7. Checklist auto-ticks (all six flags)
8. Reset sandbox → checklist cleared → reseed

Writes `docs/launch/_raw/stranger-run-latest.json`. Exit 1 on any critical step failure.

Optional Chromium smoke (local): omit `STRANGER_SKIP_BROWSER` or set `CONSOLE_URL` to a running console. CI sets `STRANGER_SKIP_BROWSER=1` so the API path stays fast and deterministic.

Optional public-gate Playwright smoke (needs live API):

```bash
pnpm exec playwright test -c playwright.stranger.config.ts
```
