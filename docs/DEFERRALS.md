# DEFERRALS — Founder Decision Log (Post P6)

## Purpose

This log records intentionally deferred scope after P6 so execution stays focused without losing important work. Use it to decide when to pull deferred items forward based on concrete triggers, instead of treating them as forgotten backlog.

## Deferred and partial decisions

| Item | Phase / area | Status | Trigger | Primary doc | Notes |
|---|---|---|---|---|---|
| SAML / enterprise SSO | AUTH-A5 | deferred | Pull forward when first enterprise customer requires SAML in writing (or at P6, whichever is earlier). | `docs/AUTH_ROADMAP.md` | Planned by design, not an omission. |
| Full policy engine (v1) | P6 | done | Trigger met in P6 engineering slices. | `docs/AEGIS_PHASE_6.md`, `docs/AEGIS_POLICY_V1.md` | Ingest enforcement, editor, replay-check, policy log UI, and signed manifests shipped. |
| Policy DSL / Rego / OPA | P6.5+ governance | deferred | Pull forward when customer policy complexity exceeds JSON v1 rules or compliance review requires externalized policy runtime. | `docs/AEGIS_POLICY_V1.md` | Current rules are intentionally simple and explicit. |
| Policy approval workflows (multi-step) | P6.5+ governance | deferred | Pull forward when org change-control needs dual approval or staged rollout by role. | `docs/AEGIS_PHASE_6.md` | Current editor uses direct publish by admin/owner only. |
| Automated replay enforcement in verify/export pipelines | P6.5+ assurance | partial | Pull forward when replay checks must run automatically in export/verification jobs, not only on-demand API route. | `docs/AEGIS_POLICY_V1.md` | Current replay route supports on-demand checks and logs. |
| Multi-anchor expansion | Aegis roadmap | deferred | Pull forward when single/stub + OTS path no longer satisfies durability/compliance targets. | `docs/AEGIS_PHASE_6.md` | Explicitly tracked in P6 deferred list. |
| Separate `app.aegis` deploy | P4 ops boundary | deferred | Execute when cookie/session isolation or tenant security review requires split deployment boundary. | `docs/AEGIS_PHASE_4.md` | Console currently ships from `apps/web`. |
| Live Stripe / production billing | billing ops | deferred | Enable when charging first paying customer and production Stripe account/webhooks are provisioned. | `README.md` | Current billing path is test-mode scaffold only. |
| TOTP backup codes | AUTH-A3 | partial | Implement before console GA hardening sign-off or immediately after first security review finding. | `docs/AUTH_ROADMAP.md` | TOTP setup/challenge shipped; recovery codes remain TODO. |
| Replace deprecated `@levminer/speakeasy` | AUTH-A3 dependency | deferred | Replace on next auth hardening sprint or before next major dependency refresh. | `docs/AUTH_ROADMAP.md` | Current TOTP implementation still imports this package. |
| Admin ops baseline (route-grouped shell + CMS/read-only views) | web/admin ops | done | Trigger met in current web admin slice. | `README.md`, `docs/AEGIS_PHASE_1.md` | Admin now ships contacts triage (status + notes), research/careers CMS, and read-only org/user tables. |
| SDK npm publish | SDK release ops | deferred | Publish when external integrator onboarding requires versioned public install path. | `docs/AEGIS_PHASE_6.md` | SDK code exists; formal package release process still pending. |
| Deploy preview / production (Vercel + Neon) | ops/deploy | partial | Complete when CI-backed preview DB branching and production approval runbook are exercised end-to-end. | `README.md` | Infra target is documented; runbooks/automation still to finalize. |
| CI: `web:test` + `aegis:test` in GitHub Actions | ops/CI | deferred | Add when PR gate must enforce full app and aegis test suites, not only current Nx subset. | `README.md` | Current CI does not run both scripts explicitly. |
| CI lint gate (`eslint` in GitHub Actions) | ops/CI (P0 quality) | deferred | Pull forward when style/quality regressions begin slipping through review or before first external contributor wave. | `README.md` | Keeps early velocity high now; make lint a hard PR gate before scale. |
| CI scope clarification: targeted checks vs `nx run-many --all` | ops/CI strategy | partial | Finalize when CI minutes/noise tradeoff is re-evaluated after first month of active PR volume. | `README.md` | Existing CI row tracks explicit `web:test` + `aegis:test`; this row tracks decision on full all-target Nx gating. |
| Demo GIF / terminal capture in README | docs/launch (P0) | deferred | Add when first public launch/demo thread is prepared or founder starts outbound onboarding. | `README.md` | Increases trust and conversion; intentionally deferred until narrative settles. |
| Staging proof documented (Vercel preview URL + notes) | ops proof (P1) | deferred | Pull forward when first async reviewer/investor needs a live link and reproducible preview notes. | `README.md` | Treat as an ops artifact, not just a one-off DM URL. |
| Lighthouse CI + performance budgets | perf/quality (P1) | deferred | Add when page speed regressions appear in PRs or before broad top-of-funnel traffic push. | `docs/AEGIS_P3_PERF.md` | Start with lightweight budgets and tighten after baseline data. |
| Rust edge collector / P3.5 perf gates | P3.5 | deferred | Start when sustained throughput and p99 latency become release gates, not local benchmark checks. | `docs/AEGIS_P3_PERF.md` | TS ingest is accepted for current MVP slice. |
| Sustained ingest load test at 200 evt/s | ingest reliability (P2) | deferred | Run when first production-like traffic forecast or customer eval expects sustained burst handling. | `docs/AEGIS_P3_PERF.md` | Convert from ad hoc benchmarking to repeatable gate with pass/fail criteria. |
| Real pod-kill chaos test for ingest durability | ingest resilience (P2) | deferred | Pull forward when durability claims must be evidenced for customer/security diligence. | `docs/AEGIS_PHASE_6.md` | Validate no data loss through forced process death and restart/recovery path. |
| Pagefind / deep aegis docs | docs/search | deferred | Add when `/aegis/docs` expands beyond stub and discoverability becomes a support burden. | `docs/AEGIS_PHASE_1.md` | Deep docs are intentionally phased after early web launch. |
| Neon RLS on `contact_messages` | ops/security | deferred | Enable once moving from app-only guards to DB-role policy enforcement in production. | `docs/AEGIS_PHASE_1.md` | Explicitly called out as next-step hardening. |
| Invites | P5 | done | Trigger met in P5 engineering slice. | `docs/AEGIS_PHASE_5.md` | Invite model, APIs, acceptance flow, and members UI are shipped. |
| Billing scaffold (test mode) | P5 billing | done | Trigger met in P5 engineering slice. | `docs/AEGIS_PHASE_5.md` | Stripe test-mode scaffold and `/console/billing` are shipped. |
| Full profile wizard + display-name onboarding | P5 onboarding | partial | Pull forward when first-time user confusion appears in onboarding feedback or support requests. | `docs/AEGIS_PHASE_5.md` | Settings surface exists; guided profile completion flow is intentionally deferred. |

## Recommended sequencing

1. Tag/ship P6 policy baseline and run founder acceptance checklist (`AEGIS_PHASE_6.md`).
2. Finish deploy preview/production operationalization on Vercel + Neon.
3. Expand CI gates to include `web:test` and `aegis:test`.
4. Pull governance/enterprise items (Rego/OPA, approval workflows, SAML) only on demand triggers.

## What is complete (P0-P6 engineering)

P0-P6 engineering scope is largely complete: local-to-cloud aegis path, P3 backbone, P4/P5 tenant console slices, and P6 policy baseline are implemented with documented acceptance checkpoints. Core org primitives, invites, RBAC, API keys, org creation, settings, Stripe test-mode billing scaffold, policy enforcement/editor/replay checks, and signed manifests are shipped. Remaining items in this log are intentional sequencing decisions (enterprise triggers, governance hardening, and post-MVP performance/security extensions), not missing execution.
