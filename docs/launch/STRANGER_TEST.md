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

Automated CI path: `pnpm launch:stranger` (writes `docs/launch/_raw/stranger-run-latest.json`). Quality-gate runs it after Playwright Chromium install.
