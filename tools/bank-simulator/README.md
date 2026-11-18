# Bank simulator (`tools/bank-simulator`) — multi-system bank (Stage 8)

Standalone multi-system bank test environment against a **hosted or local tenant**
(Demo Bank / smoke-test). Systems: **LOS** (`src_los`), **Core Banking / Ledger**
(`src_core`), **Payment Gateway** (`src_pay`), **Credit Bureau** (`src_bureau` via
`tools/demo-bureau`). Each system has its own key id, sequence and outbox (simulated
Connector). Staff UI shows systems panels; **Red Team** panel runs attacks #1–18.

Story buttons still send real events to governed intake
(`POST /v1/aegis/governed/events`) and raise approvals when held. Core disbursement
asks Aegis permit / decision-token confirm before money moves; the ledger exports
JSONL/CSV feeds for reconciliation.

```powershell
pnpm bank:up          # Postgres (Docker, wal_level=logical) + bureau :4100 + simulator :4000
pnpm bank:down
pnpm test:redteam     # fixture suite + live panel when bank:up is running
```

If Docker is unstable, `bank:up` continues with an in-memory ledger and reports **Partial**.

**Same code locally (`http://127.0.0.1:4000`) and deployed (`https://bank-demo.salanor.com`).**
Deployment runbook: `docs/DEPLOY_PRODUCTION.md` (section "Bank simulator").

```powershell
$env:AEGIS_API_BASE        = "https://api.salanor.com"
$env:AEGIS_INGEST_KEY      = "<printed once by pnpm pilot:provision-demo-tenant>"   # optional: Setup can supply it
$env:AEGIS_ORGANIZATION_ID = "<organisation id printed by the same command>"   # enables approval requests
$env:AEGIS_CONSOLE_ORIGIN  = "https://app.salanor.com"                          # optional
pnpm bank-simulator          # local: loopback only, no login
```

| Variable | Needed | Purpose |
| --- | --- | --- |
| `AEGIS_API_BASE` | default | Aegis API origin. Default config; the Setup section can override it |
| `AEGIS_INGEST_KEY` | default | Ingest key. Stays on this server; never sent to the browser. A key supplied only here is never written to disk |
| `AEGIS_ORGANIZATION_ID` | for holds | Raises the approval request so the case appears on the Approvals page. Also lets `pnpm smoke:production` confirm which tenant the simulator targets |
| `AEGIS_ORGANIZATION_NAME` | no | Display name in the status line for an env-configured start (default `Demo Bank`) |
| `AEGIS_AGENT_ID` | no | Agent shown in the status line and sent as the event `actor.id` (default: the story's own agent) |
| `AEGIS_CONSOLE_ORIGIN` | no | Origin used for case links (default `https://app.salanor.com`) |
| `BANK_SIMULATOR_PASS` | deployed | Shared passphrase, min 12 characters. Unset: loopback only, no login. Set: login page, rate limit, session cookie, may listen on all interfaces |
| `BANK_SIMULATOR_SESSION_SECRET` | no | HMAC key for the session cookie (default: random per process, so sessions end on restart) |
| `BANK_SIMULATOR_SESSION_HOURS` | no | Session length, default 8 |
| `BANK_SIMULATOR_TRUST_PROXY` | behind a proxy | `1` to read the client IP from `X-Forwarded-For` (needed on Railway so the rate limit is per person) |
| `BANK_SIMULATOR_ALLOWED_HOSTS` | no | Comma list of accepted `Host` values when a passphrase is set |
| `BANK_SIMULATOR_DATA_DIR` | no | Queue, SDK buffer and saved Setup (`config.json`, mode 0600) directory (default `.bank-simulator/`, gitignored) |
| `PORT`, `HOST` | no | Default `4000`. `HOST` defaults to `127.0.0.1`, or `0.0.0.0` when a passphrase is set and the platform provides `PORT` |
| `AEGIS_AGENT_ID`, `AEGIS_KEY_ID`, `AEGIS_AGENT_PRIVATE_KEY_B64` | no | Only to drain the SDK's signed-event buffer after an outage |

## Setup, status line and "what was sent"

- **Status line** under the banner always reads `Connected to <org> · <agent>`, or
  `Not connected · open Setup…` when nothing is configured.
- **Env defaults:** with `AEGIS_API_BASE` + `AEGIS_INGEST_KEY` set the simulator starts pre-configured
  (Demo Bank). The server also boots with neither set; story runs and the outage toggle answer `409`
  until Setup supplies them.
- **Setup** (collapsible section; behind the passphrase when `BANK_SIMULATOR_PASS` is set, loopback-only
  otherwise) takes API base, ingest key, organisation id and agent id. Each saved field overrides the
  env value. The key is written server-side to `BANK_SIMULATOR_DATA_DIR/config.json` (mode 0600) because
  the server needs the plaintext to call the API; it is never returned. `GET /api/config` answers
  `{configured, apiBase, orgId, agentId, keyPresent, keyHint: "aegis_…****", ...}`. A blank key field
  keeps the saved key, except that changing the API base requires re-entering it. "Use environment
  defaults" deletes the saved file.
- **What was sent:** every story shows each call it made: endpoint, headers (key masked as
  `aegis_…****`), payload, response status and body. All JSON and HTML responses are additionally
  scrubbed of the raw key, even if an upstream echoes it.
- **Wrong key story:** sends an ordinary event with a key Aegis does not know. Expected: HTTP `401`
  and no case (no case id, no console link, no approval request).

## Tests

```powershell
node --test tools/bank-simulator/test/key-leak.test.mjs     # or: pnpm --filter @salanor/bank-simulator test
```

Boots `server.mjs` on a free loopback port against a local mock API, saves a generated key through
Setup, GETs the page and every API (logged in and out) and asserts the raw key is absent. Also covers
the wrong-key story (401, no case), env-only start (key never written to disk) and reset.

## Access control

- **No passphrase, local:** the server refuses to listen on a non-loopback address and only accepts
  `127.0.0.1` / `localhost` hosts (DNS-rebinding guard).
- **Passphrase set:** every `/api/*` call except `/api/login` needs the `bank_sim_session` cookie
  (`HttpOnly`, `SameSite=Strict`, `Secure` over HTTPS, signed, expires). A wrong passphrase counts
  against a limit of 5 failures per client per 15 minutes (30 overall); after that the answer is
  `429` with `Retry-After`. The passphrase and session secret are never logged or returned.
- `GET /health` is open and returns only `{status:"ok"}` (for the host platform's probe).
- Every `POST /api/*` also needs the `X-Simulator: 1` header, which forces a CORS preflight that is
  never granted (cross-site pages cannot drive it).

## Stories

Story ids, titles and synthetic data live in `stories.mjs`. The outcome of each story comes from the
normal API (organization.is_demo tenant). The escalation story shows a held case that escalates after
**2 real minutes** (configuration on the tenant's held loan rules; there is no demo clock). The two
delegation stories need a delegation granted on the console's **Delegations** page first.

## Aegis unreachable

The toggle simulates a lost link. While it is on, each story runs through the SDK's real
`wrapFetch` with `onUnreachable: "proceed_and_flag"`: policy evaluation fails, the bank proceeds under
its own fallback, and the SDK queues the decision in its local buffer. The simulator also queues the
governed event with `decided_without_aegis: true`. Turn the toggle off and the queue is replayed to the
real intake; the receipt is then marked **decided without Aegis** (and Aegis still evaluates the case
for real, so a replayed case can come back held).

Queue files live under `BANK_SIMULATOR_DATA_DIR` (`.bank-simulator/` locally, gitignored). On a
host with an ephemeral disk the queue is lost on redeploy; attach a volume at `/data` if that matters.
Run a single instance (sessions and the queue are per process).

## Smoke test

`pnpm smoke:production` can drive this server's own API (login, stories, unreachable toggle) when
`BANK_SIMULATOR_URL` and `BANK_SIMULATOR_PASS` are set. It refuses to send events unless the
simulator reports the same organisation id as the smoke-test tenant.

## Local fallback

`pnpm demo:up` starts local Postgres and a **normal** API, then provisions/seeds Demo Bank
(`pilot:provision-demo-tenant` + `pilot:seed-history`). Drive stories with this standalone simulator
(`pnpm bank-simulator`) — there is no in-console simulator and no demo mode.
