# Stage 1 report: signed source events (G1)

Branch `feature/provenance`. Status: **Done**, with Partials below. `spec/` untouched.

## In-path permit commit (start of this branch)

`bd5028d` (*Ship in-path execution permit gate and Demo Bank trust model.*) is the first
commit on this branch before provenance Stages 1–9. It makes disbursement require a sealed
allow/approve bound to the action digest (`services/aegis-api/src/execution/permit.ts`), wires
that gate through bank event handling and console approvals, and documents the honest
DFIR-vs-control-plane claim in `docs/TRUST_MODEL_IN_PATH.md` so demos cannot pretend “ledger
verify” alone stops money movement.

## What Stage 1 delivers

An event can arrive with a signature from a **registered source system**. Aegis checks the
signature, the key (**against server receive time**), the clock skew vs claimed `ts`, the
sequence number and the nonce, then seals the event. A sealed event carries
`evidence_grade: "G1"` and the envelope so offline verify can re-check the source signature.

| Area | What | Where |
| --- | --- | --- |
| Signing library | AEGIS-SRC1 envelope, JCS, Ed25519 | `packages/aegis-sdk` |
| Sending agent | Durable outbox, ordered, crash-safe | `packages/aegis-connector` |
| Source registry | Sources, keys, rotation, revocation, history | migration `006_sources.sql`, `src/sources/` |
| Verification | Ordered checks, per-source advisory lock; key validity vs **receive time** | `src/sources/verify-and-accept.ts` |
| Ingest | `POST /v1/aegis/source-events` (+ envelope on `/governed/events`) | `src/routes/source-events.ts` |
| OpenAPI | Source-events contract | `openapi/source-events.openapi.yaml` |
| Enforcement | `organization.require_signed_events` (on for demo orgs) | bank-events, platform-auth |
| Console | Admin Sources page (register / rotate / revoke / **disable** / history) | `apps/web-console/.../sources` |
| Offline verify | Bundle + registry + CLI | `verify-bundle.ts`, `aegis-verify` |
| Independent check | Python envelope + **bundle** verifier | `tools/independent-verify` |
| Conformance | 15 positive + 12 negative vectors | `conformance/vectors.json` |
| Docs | Algorithm, integration | `SIGNING.md`, `INTEGRATION.md` |

## Choices (where the brief left room)

1. **New package `@salanor/aegis-sdk`** under `packages/` for AEGIS-SRC1 only — does not weaken APS-1.
2. **Sequence gaps:** accept `seq > last+1` with a recorded gap; accept a later arrival that fills a gap.
3. **Connector 409:** only 2xx marks delivered (Aegis returns 200 for idempotent duplicates).
4. **Key validity:** `valid_from` / `valid_to` / revoked judged at **Aegis receive time**, not claimed `ts`. Claimed `ts` is still used for skew. Tests cover “revoked/expired at T, event after T claiming past ts → rejected”.

## Test results (re-run 2026-11-19)

| Command | Result |
| --- | --- |
| `pnpm --filter @salanor/aegis-sdk test` | **55 / 55 passed** |
| `pnpm --filter @salanor/aegis-connector test` | **25 passed, 1 skipped** (26) |
| `node conformance/run.mjs` | **all legs passed** (TS + Python) |
| `pnpm --filter aegis-api exec vitest run test/source-envelope.test.ts test/require-signed-events-setting.test.ts test/forensic-source-envelope.test.ts test/openapi-smoke.test.ts` | **50 / 50 passed** (44 + 3 + 1 + 2) |
| `pnpm --filter aegis-api exec vitest run` (full suite) | **569 passed, 1 skipped** |
| `py -3 tools/independent-verify/verify_envelope.py --vectors conformance/vectors.json` | **OK** |
| `py -3 tools/independent-verify/verify_bundle.py --bundle tools/independent-verify/fixtures/g1-exported-bundle.json` | **OK** |
| `pnpm --filter @salanor/aegis-verify verify -- …/g1-exported-bundle.json` | **OK 1 receipt(s) verified** |
| Lint (`aegis-sdk`, `aegis-connector`, `aegis-api`, `web-console`) | **clean** |
| Typecheck (same four) | **clean** |
| Production builds (sdk, connector, aegis-api, web-console) | **clean** |
| UI unit tests | **N/A** — web-console has no vitest target; covered by lint/typecheck/build + Sources screenshots |
| gitleaks (`detect --no-git --config=.gitleaks.toml`) | **19 findings** — all local `.env` / `.env_deploy` / example env paths (not committed workspace secrets in vectors after allowlist) |

### Raw output (must match table)

```
> @salanor/aegis-sdk@0.1.0 test
 Test Files  5 passed (5)
      Tests  55 passed (55)

> @salanor/aegis-connector@0.1.0 test
 ✓ test/keystore.test.ts (6 tests | 1 skipped)
 Test Files  3 passed (3)
      Tests  25 passed | 1 skipped (26)

vectors.json and sdks/conformance/vectors/aegis-src1-v1.json are up to date
[typescript] 15 positive + 12 negative vectors OK
[python] 15 positive + 12 negative vectors OK
conformance: all legs passed

 ✓ test/source-envelope.test.ts (44 tests)
 ✓ test/forensic-source-envelope.test.ts (1 test)
 ✓ test/openapi-smoke.test.ts (2 tests)
 Test Files  4 passed (4)
      Tests  50 passed (50)
 (require-signed-events-setting included in the 50)

 Full aegis-api:
 Test Files  104 passed | 1 skipped (105)
      Tests  569 passed | 1 skipped (570)

[python] 15 positive + 12 negative vectors OK
[python-bundle] OK (signature, key-at-ts, sequence continuity)
OK 1 receipt(s) verified

gitleaks: leaks found: 19
```

Full transcripts also under `docs/provenance/_raw_*.txt` and `STAGE_1B_DEMO_OUTPUT.txt`.

### Trusted-time on main (item 2)

Not a pre-existing failure. On `main`, `trusted-time.test.ts` is **14/14 pass**. On this
branch Stage 2 had changed the stamped label to `Timestamped by …`; that broke the Stage 1/main
assertion. Restored to `Trusted time: …` in `verify-messages.ts` and `evidence-bundle.ts`. Full
suite green after that.

### Connector keystore skip (item 3)

Skipped test: **`refuses a key file readable by group/others`** (`it.skipIf(!posix)`).

Why: on Windows, Node POSIX mode bits are best-effort and NTFS ACLs govern access.
`writePrivateKey` still requests mode `0600` + `chmod`; `readPrivateKey` **skips** the
group/others check when `process.platform === "win32"`. Operators must restrict the key path
with NTFS ACLs (or encrypt with `AEGIS_KEY_PASSPHRASE`). Covered by
`documents Windows: POSIX mode bits are not enforced on read` in `keystore.test.ts`.

## Stage 1b — Demo Bank via Connector

Demo Bank keeps `require_signed_events=true`. Provision registers sources and stores private
keys under `.data/connectors/` (gitignored). Seed, bank-simulator stories, and demo-rehearse
submit through `@salanor/aegis-connector` → `/v1/aegis/source-events`.

| Step | Result |
| --- | --- |
| Migration `012_wipe_disable_update_guards` | Applied so demo wipe can clear append-only Stage 3–6 tables |
| `pnpm demo:fresh` | Wipe + provision + seed **complete**; Connector state cleared across wipe |
| Seed | **11 / 11** cases signed via LOS Connector |
| Bank allow `loan_within_limit` | **allow**, `source_signed=true`, `evidence_grade=G1`, via `aegis-connector` |
| Bank hold `loan_needs_manager` | **hold** + approval id, `source_signed` path, G1 |

Raw: [`STAGE_1B_DEMO_OUTPUT.txt`](./STAGE_1B_DEMO_OUTPUT.txt), `_raw_bank_allow.json`, `_raw_bank_hold.json`.

## Screenshots (Sources)

Under [`screenshots/`](./screenshots/):

- `sources-list.png` — list (3 demo sources)
- `sources-register.png` — register modal
- `sources-rotate.png` — replace key
- `sources-revoke.png` — revoke key
- `sources-disable.png` — disable source
- `sources-history.png` — key/source history

## Evidence bundles + offline verify (item 5)

Bundles include `source_keys` + `source_registry` for keys used (`loadSourceKeysForReceipts`).
`aegis-verify` and `verify_bundle.py` both verify
`tools/independent-verify/fixtures/g1-exported-bundle.json` (signature, key valid at recorded
`ts`, receipt sequence continuity). **Partial vs “live DB export”:** the fixture is
export-*shaped* and built with the same receipt/envelope signing path as production bundles;
a live console download was not archived in this close-out.

## Partial / follow-ups

| Item | Status |
| --- | --- |
| Live DB-exported bundle archived for offline verify | **Partial** — fixture + verifiers OK; live download not pasted |
| gitleaks clean tree | **Partial** — 19 hits in local `.env` / `.env_deploy` (expected uncommitted secrets) |
| PKCS#11/KMS private key interface in Connector | **Partial** — file/encrypted file for dev |
| Core/Pay confirm path still often unsigned permit | **Partial** — LOS loan stories are G1 |

## Corrections (exploration approved)

| # | Correction | Where |
| --- | --- | --- |
| 1 | Signature covers envelope with `event` → `event_hash` | `@salanor/aegis-sdk` |
| 2 | Domain `AEGIS-SRC1` + RFC 8785 `canonicalize` | docs + SDK |
| 3 | `require_signed_events` column; sealed changes; two-person off | org setting + provision |
| 4 | Envelope/event idempotency equality | `verify-and-accept.ts` |
| 5 | Vectors outside `spec/` | `sdks/conformance/vectors/aegis-src1-v1.json` |
| 6 | Migration 006 in upgrade test | `migrate.integration.test.ts` |

## Honesty line

Stage 1 proves **attributability** of the source system (G1). It does **not** prove content was
true — that needs G2/G3 (Stages 3–6).
