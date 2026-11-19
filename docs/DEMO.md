# Demo Bank operations (single path)

**Last verified:** 2026-11-17 (branch `remove-demo-mode`)

Local, hosted, and test demos all use the **same path**: a normal API, a tenant with
`organization.is_demo = true`, provisioned / seeded / wiped by the existing pilot commands.
There is **no** runtime demo mode and **no** time travel.

## Removed (do not set / do not call)

| Former surface | Status |
|----------------|--------|
| Demo clock / time travel (`setDemoClock`, etc.) | **Removed.** Approvals, escalation, delegation and receipts use a single `Clock`; production always uses system time. Tests may inject a fake clock in test code only. |
| `POST /v1/aegis/demo/scenarios/*`, `/v1/aegis/demo/simulator/*` | **Removed** (return 404). |
| `demo:reset`, `demo:seed-story`, `scenario:run` / `scenario:live`, in-API scenario runners | **Removed.** |
| In-console Simulator (`/aegis/demo/simulator`) | **Removed.** Use `pnpm bank-simulator`. |
| `seedDemoApprovalActors` / `@demo.test` password path | **Removed.** Personas come from `pilot:provision-demo-tenant` + `.demo-tenant-emails.local.json`. |

## Kept

- `organization.is_demo` / `is_test`, quiet “Demo organisation” tag
- `pnpm pilot:provision-demo-tenant`, `pilot:seed-history`, `pilot:wipe-tenant`, `demo:fresh`, `pack:apply`
- Standalone `pnpm bank-simulator`
- Packs, platform wipe + audit table
- Boot guards when `AEGIS_ENV=production` (for production deployments)

## One-command local demo

```powershell
# Needs PLATFORM_BOOTSTRAP_SECRET and uncommitted .demo-tenant-emails.local.json
pnpm demo:up              # Postgres + normal API + provision + seed Demo Bank
pnpm bank:up              # multi-system bank + in-process LOS Connector (signed events)
pnpm demo:connectors      # optional: standalone Connector HTTP (:8787 LOS, :8788 core, :8789 pay)
pnpm bank-simulator       # story driver alone (uses Connector keys from .data/connectors/)
pnpm demo:rehearse        # headless PASS/FAIL against normal API + signed ingest
pnpm demo:runbook-walk    # click-path + screenshots
pnpm demo:screens         # Playwright shots → docs/screens/
pnpm demo:fresh           # wipe → provision (incl. source keys) → seed via Connector
```

Demo Bank keeps `require_signed_events=true`. Provision registers `src_los` / `src_core` /
`src_pay` and stores private keys under `.data/connectors/` (gitignored). Seed history and
the bank simulator sign through `@salanor/aegis-connector` — never commit those keys.

Also: `tools/demo/demo-up.ps1` / `tools/demo/demo-up.sh`

## Hosted / production-shaped demos

Same commands against the hosted API URL (never enable a “demo mode” flag):

```powershell
pnpm pilot:provision-demo-tenant
pnpm pilot:seed-history
# refresh:
pnpm demo:fresh
# or:
pnpm pilot:wipe-tenant -- --slug demo-bank --confirm demo-bank
```

See `docs/DEPLOY_PRODUCTION.md` and `docs/DEMO_RUNBOOK.md`.

## Escalation (2 minutes)

Held-loan rules carry `escalate_after_ms` (e.g. 120_000). Escalation uses the **real clock**.
Prove with `pnpm demo:prove-escalation-2min` against a running normal API (no time travel).

## Signing keys (seal vs receipt)

- **APS seal** (after preferred-agent miss): any org **signable** `signing_key` (`key_id` on the sealed event).
- **Forensic receipt:** `AEGIS_RECEIPT_SIGNING_KEY_B64` under `AEGIS_RECEIPT_KEY_ID` (or KMS in production).

## Append-only

See `docs/APPEND_ONLY.md`. `pg_restore --disable-triggers` is gated by
`AEGIS_ALLOW_DISABLE_TRIGGERS_RESTORE` on a non-production process — **not** by .

## P10 truth statements (say these, and only these, about the hosted product)

| Topic | True statement | Do not say |
|-------|----------------|------------|
| **Key custody** | Receipts are signed with an Ed25519 key. **Plan A:** the key lives in AWS KMS and is never exported (receipts and Verify say "Key custody: AWS KMS"). **Plan B, until KMS is live:** a software key held in the service environment (receipts and Verify say "Key custody: software key (interim)"). Check `/v1/public/keys` or the Verify page for which one is active, and name it. | "Hardware-protected" or "HSM" while Verify says software key (interim); "customer-controlled keys" (BYOK) as a general claim |
| **Trusted time** | Receipts are stamped by a **public RFC 3161 time authority** (Sectigo by default). It is a free public service with **no SLA**: a stamp can be "pending" (amber) for a while, and the receipt is valid either way. The API reads the token's time and hash; full chain verification is an offline `openssl ts -verify` step. | "Guaranteed timestamp", "legally qualified timestamp" (it is not an eIDAS qualified service) |
| **Hosting region** | **eu-west**: Railway EU West (Amsterdam) for API / ID / witness; Neon Postgres in AWS `eu-central-1` (Frankfurt) when using the EU Neon project. Console is on Vercel’s edge network and holds no customer data. Organization Settings shows `eu-west` (not `us-east`). | Claiming a US region, or leaving `us-east` as the product default |
| **Compliance** | SOC 2 and EU AI Act appear only as **control mappings** (how Aegis features map to controls). No certification or attestation is claimed. | "SOC 2 certified", "EU AI Act compliant" |
| **Performance** | There is **no latency SLA**. Any number comes from the raw load-test output in `FINAL_REPORT.md` section 5, on that machine, and shows no speedup. | "<5 ms", "milliseconds", any availability or latency guarantee |
| **FedRAMP / HIPAA** | Neither is available. They are roadmap items only. | Anything implying FedRAMP authorisation or HIPAA readiness |

Also true: sealed decisions cannot be altered by the application database role
(`docs/APPEND_ONLY.md`); a decision made while Aegis was unreachable is marked "decided without Aegis";
`aegis-verify` and the public Verify page check the file you hand them against the published public key.

Hosted stack: `docs/DEPLOY_PRODUCTION.md`. The marketing site is **not published**.

## Must not claim: what Aegis proves about data

Aegis proves **when a record was made** and that it has **not changed since**. It does **not** check
that the data inside the record is accurate. Every screen and export says where the data came from
(see `docs/PROVENANCE.md`). Say the same thing out loud.

| Say | Never say |
|-----|-----------|
| "The record is intact: signed and unchanged since 14:02 UTC." | "Verified", "validated", "certified" next to an amount, a name, or a decision |
| "The data was signed by Demo Core Banking with its own key (grade G1)." | "Aegis verified the loan amount" / "Aegis confirms the customer is real" |
| "The data was sent with an ingest key; the sender did not sign it (grade G0)." | "Trusted data" or "clean data" for G0 or G1 |
| "Aegis does not check that the data is accurate." | "Aegis proves the transaction happened" (only a reconciled feed or an independent capture says that, and those are G2 and G3) |
| "Grade G1 means the source system signed this data." | "G1 means accurate" (a grade is about **who vouches for the data**, never about whether they are right) |
| "A source that signs false data produces a validly signed false record. Aegis shows who signed it." | "Tamper-proof data" (the **record** is tamper-evident; the data can still be wrong at the source) |

Wording on screen, in the PDF, in the bundle and on the share link:

- Line one: **Record intact: signed and unchanged since \<time\>**
- Line two: **Source of the data: \<grade and plain wording\>**
- Never the standalone word "Verified" next to data content. `pnpm check:wording` fails the build if it
  appears (`scripts/check-no-bare-verified.mjs`; web-console `build` runs it too).

Grades today: **G0** ingest key only, **G1** signed by the source, **G2** corroborated (reconciled or
execution matched), **G3** captured independently of the source. A case reaches G2 or G3 only by a
**sealed grade-change** receipt. Story cards may say "target G2/G3"; say the grade only after confirm
+ reconcile (or collector match) actually ran. Live G3 from Postgres logical decoding is still
**Partial** (`docs/provenance/STAGE_6_REPORT.md`). Present the **"Lying to Aegis"** segment in
`docs/DEMO_RUNBOOK.md` §12 (~8 minutes).

## Real today vs roadmap

| Real today (say this) | Roadmap / not built (do not imply) |
|-----------------------|-------------------------------------|
| Source-signed events (G1), provenance block, two-line wording | HSM / hardware-backed receipt keys as the default claim |
| Decision tokens + executor confirm (G2 when matched) | Approver **device** signatures (WebAuthn bound into the seal) |
| Feed reconciliation + Exceptions page (G2 on match) | Regulator / counterparty co-sign of witness roots |
| Approver binding: view hash + authenticated account/session | Independent external monitors product |
| Collector **interfaces** + simulated CDC tests; G3 path in code | Live pgoutput G3 in every demo environment |
| Third-party signed facts (bureau stub), input commitments, plausibility flags | TEE for policy / seal path |
| Bank simulator multi-system Red Team panel + `pnpm test:redteam` | Certified / attested product; FedRAMP; HIPAA |
| Offline bundle verify + independent Python envelope check | "Aegis verified the amount / customer is real" |

Full ladder: `docs/provenance/ASSURANCE_LADDER.md`. Stage roll-up: `docs/provenance/FINAL_STATUS.md`.

## Not done (honest)

- Website **live** publish (founder approval) — preview only; see `WEBSITE_CHANGES.md`
- Live collector G3 against Docker `wal_level=logical` (Stage 6 Partial)
- WebAuthn step-up on approve (Stage 5 Partial)
- Provenance screenshot pack under `docs/TEST_PACK/provenance/` (Stage 9 Partial)
