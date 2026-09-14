# Full pilot walkthrough

## Start here (simple)

**Three apps, three roles:**

| Who | Opens | Does what |
|-----|--------|-----------|
| **You (Salanor)** | http://localhost:3003 | Create the customer company (org + first admin). See [PLATFORM_OPS.md](../docs-internal/PLATFORM_OPS.md). |
| **Customer admin** | http://localhost:3000 | Log in, invite engineers, create **API key**. |
| **Engineer (or you)** | Terminal: `pnpm pilot:agent` | Runs **`apps/pilot-agent`** — a small demo AI app that sends events to Salanor. |

**What uses the API key and signing key?**  
Only **`apps/pilot-agent`** (not the browser). You paste org/agent/key values into `apps/pilot-agent/.env`, then run `pnpm pilot:agent`. Events show up in the **console UI** under Traces.

**Docs to use:**

| Doc | When |
|-----|------|
| **This file** | Full step list |
| [PLATFORM_OPS.md](../docs-internal/PLATFORM_OPS.md) | How to use `:3003` (provision org) |
| [apps/pilot-agent/README.md](../apps/pilot-agent/README.md) | Env vars for the demo agent |

**Your first practice run (no real client yet):**

```bash
pnpm pilot:reset
pnpm dev                    # keep running — starts aegis-api on :8080
# new terminal (wait until http://127.0.0.1:8080/health returns ok):
pnpm pilot:ensure-policy
pnpm pilot:agent
```

If `pilot:agent` says **fetch failed** but `/health` works in the browser:

- **Do not** start another `pnpm dev` if you see `EADDRINUSE` on 8080 — the API is already running.
- Use `pnpm pilot:agent` (not `pilot:agent:rebuild`) while `pnpm dev` is up; rebuilding the SDK can restart the API mid-flight.
- If the API is down: `pnpm --filter aegis-api dev` only, or `docker compose up -d` then `pnpm dev`.

Then open http://localhost:3000 → login `dev@salanor.local` → **Traces** → open the trace URL printed by the command.

### Who creates organizations? (production model)

This is the important distinction:

| Question | Answer (what is built **today**) |
|----------|----------------------------------|
| **Who creates the company (organization)?** | **Salanor staff** — you log into **Platform Ops `:3003`** and **Provision org**. The customer does **not** create their own organization in the product yet. |
| **Who creates the first admin *user*?** | **Also Salanor staff** at provision time (you enter admin email + temp password). That person is the customer’s org admin — they did **not** self-register the company. |
| **How do other users get accounts?** | **Org admin** invites them in the **customer console `:3000`**. Invitee opens the link and **creates their user account** (password) — but joins an **existing** org; they do not create a new organization. |
| **Will customers ever create their own org?** | **Later** — self-serve signup + Stripe (not built yet). When you add it, that becomes a second onboarding path. |

**For design partners, do exactly the production path:**

1. You → `:3003` → Provision org + first admin  
2. Hand partner → `:3000` login (email/password you set)  
3. Partner admin → invites engineers  
4. Engineer → API key + run `pilot-agent` (or their app with SDK)

Do **not** use `dev@salanor.local` for partner demos — that is only your local sandbox.

**If payment is not blocked** on a provisioned org, run:

```bash
pnpm pilot:ensure-policy
pnpm pilot:agent
```

(New orgs provisioned **after** the latest code + `pnpm dev` restart get the deny policy automatically.)

---

## What you are proving

| Actor | Tool | Outcome |
|-------|------|---------|
| **You (Salanor)** | Platform Ops `:3003` | Create customer org + admin |
| **Customer admin** | Console `:3000` | Invite team, create API key, policies |
| **Customer engineer** | **`apps/pilot-agent`** (you run it first; they run it later) | Signed events → **Traces** show LLM data touched + **blocked payment** |
| **Everyone** | Console `:3000` | Audit that AI did not execute a forbidden payment |

The pilot agent simulates: **support ticket → Gemini classifies/summarizes/replies → agent tries `stripe.paymentIntents.create` → policy DENY → safe reply only.**

---

## Part 0 — Reset to clean baseline

Destroys local DB data. Use before each dry run.

```bash
docker compose down -v
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

Or one command:

```bash
pnpm pilot:reset
```

**Seeded logins** (passwords from repo `.env`):

| Email | Password env | Role |
|-------|----------------|------|
| `dev@salanor.local` | `DEV_CONSOLE_PASSWORD_ORG_A` | Admin org A + B; **platform_staff** (Ops `:3003`) |
| `dev-b@salanor.local` | `DEV_CONSOLE_PASSWORD_ORG_B` | Admin org B only |

**Dev org** (for self-test before a real partner):

| Field | Value |
|-------|--------|
| Organization ID | `11111111-1111-4111-8111-111111111111` |
| Ingest key (seed) | `aegis_dev_local_change_me` |
| Signing private key | `DEV_SIGNING_PRIVATE_KEY_B64` in `.env.example` |

Seed includes an active policy that **denies** `stripe.paymentIntents.create`.

---

## Part 1 — Start the stack

```bash
pnpm install
pnpm --filter @salanor/aegis build
pnpm dev
```

| URL | Purpose |
|-----|---------|
| http://localhost:3000/login | Customer console |
| http://localhost:3003/login | Platform Ops (you) |
| http://127.0.0.1:8080/health | API |
| http://127.0.0.1:8091/health | ID |

Optional developer smoke (not shown to client):

```bash
pnpm pilot:phase-a
```

---

## Part 2 — Self-test with dev seed (do this first)

Prove the loop works **before** provisioning a fake “Acme” org.

### 2a. Configure pilot agent

```bash
cp apps/pilot-agent/.env.example apps/pilot-agent/.env
```

Edit `apps/pilot-agent/.env` — for dev seed, defaults in `.env.example` already match.

Optional: add `GEMINI_API_KEY=...` for live Gemini. **Without it**, the app runs in **MOCK** mode but still ingests signed events (fine for console demo).

### 2b. Run the agent

```bash
pnpm pilot:agent
```

Expected console output:

- 4 steps (classify → summarize → payment **BLOCKED** → safe reply)
- A **trace URL** like `http://localhost:3000/aegis/traces/trc_...`

### 2c. Verify in browser (UI)

1. Login `:3000` as `dev@salanor.local`
2. **Traces** → open the trace from the script output
3. Confirm:
   - Multiple **`llm_invocation`** events with `data_touched`, `prompt_preview`, `data_classification`
   - **`policy_decision` / deny** on `stripe.paymentIntents.create`
   - No successful payment result event after deny
4. **Logs** — prior admin actions if you clicked around
5. **Policies** — active rule denying `stripe.paymentIntents.create`

You have now done a **full end-user outcome** without the client writing code.

---

## Part 3 — Real design partner flow (UI + their credentials)

### 3a. You — Platform Ops (`:3003`)

1. Login `dev@salanor.local`
2. **Provision org**
   - Name: `Acme Pilot`
   - Slug: `acme-pilot`
   - Admin email: address you control
   - Admin password: temp password
3. **Copy** from success screen:
   - `organization_id`, `agent_id`, `key_id`
   - **Signing private key** (shown once)

### 3b. Partner admin — Console (`:3000`)

Hand them **only** http://localhost:3000/login (prod: `https://app.salanor.com/login`).

They do in the UI:

1. Login → **Dashboard**
2. **Members** → invite engineer (incognito to accept)
3. **API keys** → create `pilot-ingest` → copy secret once
4. **Policies** → optional extra rules (seed policy already denies Stripe payments on dev; new org may need a policy — create draft → activate deny `stripe.paymentIntents.create`)

### 3c. Running events — three options

| Option | Who runs code | When |
|--------|----------------|------|
| **A — You demo on call** | You run `pnpm pilot:agent` with **their** `.env` | First meeting |
| **B — They run reference app** | They clone repo (or you zip `apps/pilot-agent`), fill `.env`, `pnpm pilot:agent` | Week 1 pilot |
| **C — They embed SDK** | Their production agent uses `@salanor/aegis` | Production path |

**Clients do not need to integrate the SDK on day one.** Options A or B use the same reference app you tested in Part 2.

### 3d. Point partner app at their org

Update `apps/pilot-agent/.env`:

```env
AEGIS_INGEST_API_KEY=<secret from console API keys>
PILOT_ORGANIZATION_ID=<from provision>
PILOT_AGENT_ID=<from provision>
PILOT_KEY_ID=<from provision>
PILOT_SIGNING_PRIVATE_KEY_B64=<from provision>
GEMINI_API_KEY=<their or your Google AI key>
```

```bash
pnpm pilot:agent
```

They refresh **Traces** in the UI — same outcome as Part 2c.

---

## Part 4 — Console UI checklist (partner-facing)

Do together in the browser on `:3000`:

| Step | Page | Pass criteria |
|------|------|----------------|
| 1 | Login / logout | Session works |
| 2 | Dashboard | Loads after ingest |
| 3 | Traces | Full trace from pilot agent; event payloads show `data_touched` |
| 4 | Policies | Deny rule visible; payment tool blocked in trace |
| 5 | Members | Invite + role (engineer cannot create keys) |
| 6 | API keys | Create / revoke |
| 7 | Logs | Audit rows for invite + keys |
| 8 | Settings → Organization | Plan + usage |
| 9 | Settings → Security | Password change |

---

## Part 5 — What to tell clients

**Pitch (30 seconds):**  
“We record every AI tool and LLM step with cryptographic signatures. Your policies block dangerous actions before they run. You review traces in the console — what data the model saw, what it tried to do, and what was denied.”

**What they install:**  
- **Console:** nothing (browser)  
- **Telemetry:** our reference app or `@salanor/aegis` in their agent (later)

**What you install for the pilot:**  
- Salanor stack (Docker + `pnpm dev`)  
- Optional: `GEMINI_API_KEY` for live Google calls

---

## Part 6 — Troubleshooting

| Symptom | Fix |
|---------|-----|
| Provision 403 | Restart `pnpm dev`; check `PLATFORM_BOOTSTRAP_SECRET` in `.env` |
| Pilot agent “Missing env” | Copy `apps/pilot-agent/.env.example` → `.env` |
| Ingest 401 | Wrong API key; create new key in console |
| Ingest 422 signature | Wrong `PILOT_SIGNING_PRIVATE_KEY_B64` / key_id mismatch |
| No traces | Wrong `PILOT_ORGANIZATION_ID`; key must belong to same org |
| Payment not denied | Activate policy denying `stripe.paymentIntents.create` |
| Gemini errors | Omit `GEMINI_API_KEY` to use MOCK mode |

---

## Commands reference

```bash
pnpm pilot:reset      # wipe DB + migrate + seed
pnpm dev              # console + platform + API + ID
pnpm pilot:agent      # run support-refund scenario → traces
pnpm pilot:phase-a    # API smoke (developer only)
pnpm pilot:e2e        # onboarding API test (developer only)
```

---

## Related

- [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md) — detailed UI paths  
- [PLATFORM_OPS.md](../docs-internal/PLATFORM_OPS.md) — staff app  
- [apps/pilot-agent/README.md](../apps/pilot-agent/README.md) — env vars for the reference app
