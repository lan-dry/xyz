# Rule capabilities (inventory)

Honest inventory of what Aegis can express in policy/rules **today**.  
Banks already run limits, fraud engines and ML scores; Aegis is meant to **govern around** those signals — this doc says what the engines can actually say.

There is **not** one unified DSL. Four surfaces exist:

| Surface | Entry | Role |
| --- | --- | --- |
| **Bank pack rules** | `evaluateBankEvent` → `evalExpr` / `amount_*` / authority matrix | Demo Bank / retail loan & payment packs |
| **APS / console policy** | `evaluateToolPolicy` → `rule_type` + `when` | Agent/tool policies in the console |
| **OPA (optional)** | `evaluateWithOpa` + `default.rego` | Tool-pattern match only; **no** attribute DSL |
| **Ingest Policy v1** | field presence / size | Out of scope for rich decision rules |

Labels: **Real** | **Partial** | **Absent**.

---

## 1. Conditions and operators

### Bank `Expr` — Real

`services/aegis-api/src/bank/expr.ts` (`evalExpr`, `MathTerm`)

| Operator | Notes |
| --- | --- |
| `and` / `or` / `not` | Nested boolean trees |
| `exists` | Path present |
| `eq` / `ne` | Path or literal |
| `gt` / `gte` / `lt` / `lte` | Numeric; unresolved path → false |
| `in` / `nin` | Membership |
| `contains` | Array membership or substring |
| `math` | `mul` / `add` / `sub` / `div` with `{ path }` operands |

### Bank condition bag (outside `Expr`) — Real

`ruleMatchesAttributes` in `services/aegis-api/src/bank/evaluate.ts`

- `conditions.expr`
- `amount_gte` / `amount_gt` / `amount_lte` / `amount_lt` / `amount_eq`
- `hard_stop: true` (cannot be cleared by ordinary approve)

### APS `PolicyConditions` — Real (typed)

`services/aegis-api/src/policy/amount.ts`, evaluated in `evaluate-conditions.ts`

| `rule_type` | Status |
| --- | --- |
| `tool` | Real |
| `max_per_tx` / `min_per_tx` | Real |
| `max_daily_total` | **Partial** (see §3) |
| `blocked_beneficiary` | Real |
| `beneficiary_match` | Real |

`limit_source`: `fixed` | `segment_table` | `lookup` — **`lookup` is a stub** (always fails → `on_lookup_fail`).

### Validation — Partial

`KNOWN_CONDITION_KEYS` in `bank/rule-validate.ts` is a shallow allowlist. Nested `Expr` trees are **not** Zod/JSON-Schema validated.

### OPA — Partial / thin

`policy/rego/default.rego` matches `tool_pattern` only. Conditions are not passed into WASM.

---

## 2. Attributes and signals available to rules

### Bank attributes — Real (opaque bag)

`BankEvent.attributes: Record<string, unknown>`. Paths used in packs today (not a published registry):

| Path | Example use |
| --- | --- |
| amount (via `readAmount`) | `amount_*`, authority matrix |
| `model.score` | LN-07 hold when `gt` 0.7 |
| `screening.sanctions_hit` / `screening.pep_hit` | SANC-01 hard stop |
| `payment.callback_verified` | PAY-03 hold |
| `product` / currency | Authority matrix |

### APS `PayloadContext` / `when` — Real intake, Partial matching

`policy/payload-context.ts`, `matchesPolicyWhen`

**Extracted:** `segment`, `account_type`, `beneficiary`, `customer_on_file` / `expected_beneficiary`, `merchant_age_days`, `risk_tier`, `product_type`, `previous_pattern`, `sensitivity`, `risk_score` (+ `source`, `model_name`, `model_version`, `scored_at`).

**`when` can match:** `segment(s)`, `account_type(s)`, `beneficiary(ies)`, `merchant_age_days_lt|lte`, `risk_tier`, `product_type`, `sensitivity`.

**`when` cannot match:** `risk_score`, `model_version`, `channel`, `beneficiary_country`, `time_of_day`, `previous_pattern` (extracted but not a matcher).

### Score bands — Real (org-wide)

`repo/score-bands.ts` + `applyScoreBandsAndSignalFallback`. Defaults escalate by score. **Not** keyed by customer segment.

---

## 3. Aggregation over time

| Capability | Status | How |
| --- | --- | --- |
| Rolling **amount** sum | **Partial** | APS `max_daily_total` → `sumDailyAmountUsd` |
| Window | **Partial** | `window_hours` default 24, clamped **1–168** |
| Data source | **Partial** | APS `event` table by tool pattern + ingested_at — **not** sealed forensic receipts, **not** bank sealed events across connectors |
| Count / rate / velocity | **Absent** | No count or rate operator |
| Cross-channel cumulative from sealed history | **Absent** | |

Honest label for any velocity UI today: if/when built from sealed Aegis events, it must say **"counts only activity reported to Aegis"**.

---

## 4. Boolean composition (AND / OR / NOT)

| Surface | AND | OR | NOT | Status |
| --- | --- | --- | --- | --- |
| Bank `Expr` | yes | yes | yes | **Real** |
| APS `when` | all fields (implicit) | no combinator | no | **Partial** |
| Rule combine | `top_priority` / `all_matching` | — | — | **Real** |
| APS layers | ceiling > contextual > override | — | — | **Real** ranking |

---

## 5. Per-segment / product / channel values

| Dimension | Status |
| --- | --- |
| Segment table limits (`segment_limits`) | **Real** (APS) |
| Segment filter (`when.segment`) | **Real** (APS) |
| Product × amount × currency (authority matrix) | **Real** (bank) |
| Product filter (`when.product_type`) | **Partial** (filter only; no product limit table) |
| Joint **segment × product** limit grid | **Absent** |
| Channel as a rule condition | **Absent** (`approval_channel` is delivery plumbing) |

---

## 6. External model score and version

| Capability | Status |
| --- | --- |
| Ingest score + model name/version into evaluation context | **Real** (APS) |
| Org-wide score bands escalate outcome | **Real** |
| Bank pack threshold on `model.score` (e.g. LN-07) | **Real** |
| `when` on score or model version | **Absent** |
| Per-segment score threshold | **Absent** |
| Provenance label “asserted by source” vs “signed by model service” | **Partial** — score is treated as source claim unless a separate signed third-party fact path is used |

---

## 7. Override / fraud-block / release

| Path | Status |
| --- | --- |
| Hard stop → cannot ordinary-approve | **Real** (`hard_stop`) |
| Release with reason + elevated role | **Real** (`POST …/approvals/:id/release`) |
| SoD: approver ≠ requester | **Real** on approve/release |
| Approver view hash / binding on seal | **Real** (Stage 5) |
| Executor break-glass (execution path) | **Real** (`break_glass` on confirm) |
| Policy layer tag `override` | **Partial** (no TTL/expiry in engine) |
| Dedicated fraud-block override contract sealing score + version + non-requester + reason + view | **Absent** as one required artifact |
| `score_band.require_four_eyes` | **Partial** — echoed as signal; not a hard gate elsewhere |

---

## 8. What the demo scenarios need vs today

| Needed for realistic demo | Status (after governance minimum) |
| --- | --- |
| Limits by **customer segment and product** | **Real** — pack `segment_product_limits` → org `governance_settings`; derived `aegis.exceeds_segment_daily_*` |
| Cumulative **amount and count** per customer over 1h / 24h / 7d from **sealed** events across channels | **Real** — `bank/velocity.ts` over sealed `event` rows; labelled *counts only activity reported to Aegis* |
| New beneficiary (first time for customer, derived by Aegis) | **Real** — `hasSeenBeneficiary` |
| Beneficiary country, channel, time of day | **Real** — pass-through + `classifyTimeOfDay` (Africa/Kigali) |
| External model score + version, threshold per segment, labelled asserted-by-source unless model-signed | **Real** — `FRD-SCORE-RET` (retail ≥ 0.9); `aegis.model_score_label` |
| Combinations with AND / OR / NOT | **Real** in bank `Expr` (VEL / BEN / FRD rules) |
| Fraud-block override: named non-requester + reason; sealed with score, version, approver, what they saw | **Real** — release seals `fraud_block_override` on the approval receipt |

---

## Concrete banking pack rules today

From `services/aegis-api/src/packs/demo/banking/pack.json` (v4):

| Rule | Mechanism |
| --- | --- |
| AUTH-RL-* / AUTH-XFER-* | Authority matrix amount bands on `retail_loan` / `payment_transfer` / RWF |
| VEL-SEG-DAY | Segment×product daily amount/count from sealed velocity → hold |
| BEN-NEW-OFF | New beneficiary ∧ large ∧ off_hours → hold |
| FRD-SCORE-RET | retail_standard ∧ model.score ≥ 0.9 → hard stop; Fraud Analyst release |
| LN-07 | `0.7 < model.score < 0.9` → hold + Credit Manager |
| SANC-01 | `hard_stop` + `or(sanctions, pep)` → deny |
| PAY-03 | callback not verified → hold |

---

## Bottom line

**Can express today:** bank `Expr` AND/OR/NOT; product×amount matrix; **segment×product rolling limits**; **sealed cross-channel amount+count velocity** (1h/24h/7d); new beneficiary / country / channel / time of day; per-segment fraud score hard-stop with labelled source assertion; fraud-block override seal; plain-English hold/stop lines on the case page.

**Partial:** APS `when` still AND-only; APS `max_daily_total` remains separate from bank sealed velocity; model version is recorded and labelled but version pinning is not a separate gate.

**Still out of scope here:** retention / legal-hold product gaps (see `docs/FORENSIC_READINESS_MAPPING.md`).
