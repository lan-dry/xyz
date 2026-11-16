# Bank-ready notes — F2 and F13

## F2 — `allow_with_obligation` next to outcome `allow`

**Verdict: bug in demo v4 seeding + obligation typing; engine D2 behaviour is correct once fixed.**

What the examiner saw: `matched_rules` listed `r_v4_…` with `decision: allow_with_obligation` beside `AUTH-RL`, while `outcome` was `allow`, with no explanation.

Root causes:

1. Scenario 9 inserted `r_v4_*` with `conditions.amount_gte` but the bank combiner only respected `attr_expr` / `conditions.expr`, so **the rule always matched** even below 15,000,000 RWF.
2. Obligations used `type: "require_approval"`, which was **not** recognised as human approval, so D2 correctly mapped `allow_with_obligation` → **allow** (non-human obligation must not become `hold`).

Fixes:

- Bank rule matching now honours `amount_gte` / `amount_gt` / `amount_lte` / `amount_lt` / `amount_eq`.
- `require_approval` is treated as human approval (with `human_approval`, `approval`, `ask_person`).
- Scenario 9 seeds `kind: "human_approval"` with `required_role`.
- Every receipt carries **`decision_basis`**: each matched rule’s effect, which rule decided, and an explicit sentence when a matched `allow_with_obligation` did not become `hold`.

Regression tests: `test/bank-evaluate.test.ts` → “F2 matched_rules vs outcome (decision_basis)”.

---

## F13 — policy evaluate record failed / evidence write failure

**Verdict: previously unacceptable; fixed for the Workflow Bridge path and for forensic receipt write when a signing key is configured.**

What happened: `[aegis] policy evaluate record failed Error: No Workflow Bridge signing key` was logged and the handler still returned **200** with the decision (`recorded: false`). `wrapFetch` ignored `recorded` / `record_error` and proceeded on `decision` alone — so a caller could act without evidence.

Defined behaviour (enforce):

1. **`POST /v1/aegis/policy/evaluate`**: if the gate/evidence record throws → body includes `evidence_status: "failed"` and `record_error`. **Default HTTP status is 503** (fail-safe). Opt out only with `AEGIS_ENFORCE_REQUIRE_EVIDENCE=0` (returns 200 — **unsafe for production**; vitest setup uses this so legacy harnesses keep working).
2. **TypeScript SDK `evaluatePolicyViaApi`**: treats non-OK **and** `evidence_status: "failed"` as errors → `wrapFetch` applies `onUnreachable` / `fail_closed` (hold) or `fail_open_buffer` as configured. **No final proceed on a failed evidence write.**
3. **Bank intake**: if `AEGIS_RECEIPT_SIGNING_KEY_B64` is set and forensic receipt write fails → response `outcome: hold` with `flags.evidence_status: "failed"` (unless `AEGIS_ENFORCE_REQUIRE_EVIDENCE=0`).

Covered by `test/evidence-write-failure.test.ts`.

---

## B1 — reject unknown rule content at publish

Unrecognised condition keys or obligation kinds fail validation on **create** and **activate** with `422 invalid_policy_rules`. Shipped packs are scanned in `test/rule-validate.test.ts`.
