# Decisions — forensic / bank pilot workstream

Branch: `forensic-demo-readiness`  
Baseline tag: `pre-forensic-demo`

---

## D1 — Extend APS-1; do not rewrite the ledger

**Decision:** Keep the existing sealed APS-1 event ledger (per org+agent sequence, Ed25519, JCS, Merkle witness). Add a **bank adapter** and a **derived forensic receipt** that always cites underlying `event_id` / `event_hash` / `sequence_num`. No second independent hash chain.

**Why:** Smallest change that meets acceptance criteria; preserves working ingest, witness, and console.

---

## D2 — Outcome vocabulary at the API boundary

**Decision:** At the bank/decision API boundary use `allow` | `hold` | `stop`. Internally map:

| Boundary | Internal |
|----------|----------|
| allow | `allow` |
| hold | `allow_with_obligation` **only when the obligation is human approval** |
| stop | `deny` (hard_stop metadata when applicable) |

Other obligation kinds must not become `hold`.

---

## D3 — Evaluate-all-matching-rules is opt-in

**Decision:** Existing policies keep top-priority winner behaviour (`evaluateRules` as at `pre-forensic-demo`). Bank policies set `combine: "all_matching"` (or equivalent) to evaluate all matches, apply hard-stop / hold-union / allow, and list every matched rule on the receipt.

**Why:** Protect Northwind and existing tenant behaviour; golden baseline in `docs/baselines/pre-forensic-demo/`.

---

## D4 — Case identity

**Decision:** `case_id` from the bank event is stored on the payload and indexed for search. The ledger correlation id remains `trace_id`. Receipts expose both.

---

## D5 — Demo clock and reset production guard

**Decision:** `reset` and demo clock refuse to run unless `AEGIS_DEMO_MODE=true` (or equivalent) and the database is not a production target. Receipts created under demo clock include `flags.demo_clock = true`.

---

## D6 — Append-only vs retention

**Decision:** Append-only triggers block destructive UPDATE/DELETE of seal fields. Retention purge **redacts** personal fields while keeping signed hashes verifiable. Triggers ship in a dedicated migration with tested rollback and must not break purge, migrations, or backups.

---

## D7 — Defaults for existing tenants

**Decision:** Record-only off by default. Dual-approver policy publish optional. No demo users or demo passwords outside demo configuration / seed.

---

## D8 — Website publish

**Decision:** Website changes ship only on a preview. Live salanor.com is not updated from this branch. Copy and claim changes are listed in `docs/WEBSITE_CHANGES.md` for founder approval.

---

## D9 — Append-only scope on `event`

**Decision:** Append-only triggers lock `event_id`, `organization_id`, `agent_id`, `event_hash`, `sequence_num`, `prev_event_hash`. Payload redaction (retention) and legacy resign of `sig_*` remain allowed so purge and bridge resign keep working. Forensic receipts themselves are fully immutable (no UPDATE/DELETE).

**Why:** GO requires purge and backups to keep working; full signature immutability on `event` would break existing resign paths without a larger redesign.

---

## D10 — Genericity: no sector hard-coding in the engine

**Decision:** Authority roles, currencies, products, matrix bands, and field policies come only from tenant configuration or labelled `demo_only` policy packs (`services/aegis-api/src/packs/`). The engine has no default currency or role ladder. Demo packs (`demo.banking`, `demo.insurance`) are illustrative. Real institution names are forbidden on the product surface (enforced by `test/no-institution-names.test.ts`); customer outreach decks under `docs/presentations/` are excluded from that scan.

**Why:** Aegis must serve banking, insurance, and fintech without code changes — configuration and replaceable packs only.

---

## Later decisions

Add new entries below as D11+ when implementation forces a change from the GO prompt.
