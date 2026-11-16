# Expected results — exact screen wording

Match these after each [TEST_PLAN.md](./TEST_PLAN.md) step. Numbers marked *N* may vary with seed size; the shape must match.

## Onboarding (A)

| Step | Must show |
|------|-----------|
| A2 | New org name in org switcher; slug unique |
| A3 | Invite email subject/body from Salanor ID; accept page sets password |
| A4 | Members row: admin email, role Admin/Owner |
| A6 | Rules: active version label (e.g. **v3** before live dual-publish) |
| A7 | API keys: key name listed; secret shown **once** then only prefix |
| A8 | Simulator status line: `Connected to <org name or id> · <agent>` — never the raw key |
| A9 | Outcome chip **Allowed**; Live feed row for the case |
| A10 | Four answers filled; Verify checks listed (pass / fail / amber pending witness) |

## Runbook (B)

| Step | Must show |
|------|-----------|
| B1 | Approvals badge **0** when queue empty; Live feed historical cases only |
| B2 | **Allowed**; “No approval needed…” (or AUTH-RL wording) on Who approved |
| B3 | **Held** / Ask a person; badge ≥ 1 |
| B4 | Officer: “You cannot approve this…” (or equivalent plain refusal) |
| B5 | Manager can approve; after confirm: timeline includes Approved by … → Released |
| B6 | Rules show **v4** live; older case still shows policy **v3** on receipt |
| B7 | Inside window: deputy can decide; outside: refused / held without delegate power |
| B8 | After ~2 minutes: escalated role required (Head of Compliance or configured ladder) |
| B9 | Hard stop: Approve disabled or Release path; reason code / callback required fields |
| B11 | Reports preview e.g. Allowed / Held rows with counts; CSV has same columns |
| B12 | Access log entry for receipt view (actor email + time) |
| B13 | Public Verify: signature / hash / sequence / policy / approvals / witness / time checks |
| B14 | Wrong key: HTTP **401** in “what was sent”; no case id; Live feed unchanged for that click |

## Cleanup (C)

| Step | Must show |
|------|-----------|
| C1 | Dry-run table of row counts; org still present |
| C2 | Post-wipe: zero rows for that org’s tenant tables; `platform_tenant_wipe_audit` has a new row |
| C3 | After `demo:fresh`: Demo Bank members/rules back; ingest key **hash unchanged**; seed cases present |
| C4 | Other tenant evidence bundle: `pnpm aegis-verify <bundle> --keys <keys>` → **ok** / PASS |
