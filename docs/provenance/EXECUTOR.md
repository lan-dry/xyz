# Decision tokens and executor confirm (Stage 3)

How the in-path **permit** relates to the **decision token**: see
[PERMIT_AND_TOKEN.md](./PERMIT_AND_TOKEN.md) (one page). This document is the token/confirm
operator detail.

Aegis seals what a source system sends. That does not stop the **executing** system
from paying different parameters than those that were authorised. Decision tokens close
that gap: the gate issues a short-lived signed token that binds the executable fields, and
the executor must confirm those exact fields before money moves.

## 1. What the pack declares

Each workflow in a policy pack may set:

| Field | Default | Meaning |
| --- | --- | --- |
| `executable_params` | `[]` (no token) | Fields bound into the token, e.g. `amount`, `currency`, `beneficiary_account`, `product` |
| `execution_control` | `observe` | `observe` = token may be issued but the executor is not required to confirm; `enforce` = must confirm |
| `on_aegis_unavailable` | `allow_and_flag` | When Aegis cannot be reached for confirm under `enforce`: proceed and flag, or block |
| `action_type` | `loan.disburse` | Bound into the token |
| `token_ttl_sec` | `3600` | Lifetime from `issued_at` |

Stored on `governed_workflow.execution_config` when a pack is applied.

## 2. Decision token (AEGIS-TOKEN1)

Issued when a case is **allowed**, or **approved** after a hold, and the workflow declares
non-empty `executable_params`.

```json
{
  "v": 1,
  "token_id": "dtk_…",
  "tenant": "<organization_id>",
  "case_id": "LN-…",
  "decision_id": "dec_…",
  "action_type": "loan.disburse",
  "params_hash": "<sha256 hex of JCS(executable params)>",
  "issued_at": "2026-11-18T10:00:00.000Z",
  "expires_at": "2026-11-18T11:00:00.000Z",
  "nonce": "<base64url>",
  "key_id": "<Aegis decision / receipt key id>",
  "signature": "<base64url Ed25519>"
}
```

Signature input:

```
SHA-256("AEGIS-TOKEN1\n" + key_id + "\n" + JCS(token without signature))
```

Same Ed25519 custody as forensic receipts (`AEGIS_RECEIPT_*` / KMS). Domain separation
(`AEGIS-TOKEN1` vs `AEGIS-RECEIPT1`) means a receipt signature is never a valid token.

Public keys: `GET /v1/public/decision-keys` and `GET /.well-known/aegis/decision-keys.json`.
Evidence bundles include `decision_keys` and `decision_tokens` for the case.

SDK (`@salanor/aegis-sdk`): `paramsHash`, `signDecisionToken`, `verifyDecisionToken`,
`checkToken` (offline), `resolveOnAegisUnavailable`.

## 3. Confirm

`POST /v1/aegis/executions/confirm` (ingest bearer). Body:

```json
{
  "token": { "…signed decision token…" },
  "params": {
    "amount": "1500000",
    "currency": "RWF",
    "beneficiary_account": "ACCT-1",
    "product": "retail_loan"
  },
  "source_envelope": { "…optional AEGIS-SRC1 envelope…" }
}
```

Preferred: wrap the params in an executor `source_envelope` so the claim is attributable.
The Connector’s `POST /execute/confirm` forwards here and source-signs `params` when no
envelope is supplied.

Checks, in order: token signature; not expired; not used; not revoked; case not stopped;
`paramsHash(actual) == token.params_hash`. On success the token is marked **used**
atomically (two concurrent confirms → exactly one wins). Success is sealed as
`executed` (“Executed: parameters hash matched token”). Failures are sealed as
`execution_mismatch` and written to `execution_exception`, naming which check failed and
which fields differ.

### Offline

`checkToken(token, actualParams, publicKey)` verifies signature, expiry and hash locally.
**Single-use enforcement needs the online confirm.** Reconciliation (Stage 4) catches
offline use. When Aegis is unreachable under `enforce`:

- `block` — do not execute
- `allow_and_flag` — execute, then `POST …/confirm` with `flagged_unavailable: true`
  (creates an exception for reconciliation)

### Break-glass

```json
{ "break_glass": true, "reason": "…mandatory…", "case_id": "LN-…", "params": { } }
```

Reason is required. Creates an `execution_exception` of kind `break_glass` and seals a
`break_glass` receipt. Use only when a human has authorised bypassing the token path.

## 4. Observe vs enforce

Under `observe`, Aegis still issues tokens when params are declared, so executors that
are ready can confirm and raise the case toward grade G2 (`execution_matched`). Executors
that are not yet wired are not blocked. Switch the pack to `enforce` when the core ledger
(or payment gateway) calls confirm on every disbursement.

## 5. Confirm call — short examples

Call confirm **before** money moves. Pass the decision token from the allow/approve
response and the **actual** parameters you are about to execute. Prefer wrapping
`params` in an executor source envelope (see [INTEGRATION.md](./INTEGRATION.md));
unsigned `params` still work when the Connector signs for you.

### TypeScript (SDK + fetch)

```ts
import { checkToken } from "@salanor/aegis-sdk";

// Optional offline pre-check (sig / expiry / hash). Single-use still needs online confirm.
const local = checkToken(token, params, decisionPublicKey);
if (!local.ok) throw new Error(local.reason);

const res = await fetch(`${AEGIS_URL}/v1/aegis/executions/confirm`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${INGEST_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ token, params }),
});
if (!res.ok) {
  // Do not disburse. Inspect body.exception / sealed execution_mismatch.
  throw new Error(`confirm refused: ${res.status}`);
}
// Safe to disburse the exact params that matched.
```

### Java (pseudo-code)

```java
// HttpClient + Jackson (or equivalent). Token and params are the same shapes as above.
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create(aegisUrl + "/v1/aegis/executions/confirm"))
    .header("Authorization", "Bearer " + ingestKey)
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(
        Map.of("token", token, "params", params))))
    .build();
HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
if (res.statusCode() != 200) {
  throw new IllegalStateException("confirm refused: " + res.statusCode());
}
// Disburse only after 200.
```

### C# (pseudo-code)

```csharp
using var req = new HttpRequestMessage(HttpMethod.Post, $"{aegisUrl}/v1/aegis/executions/confirm");
req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ingestKey);
req.Content = JsonContent.Create(new { token, params = actualParams });
var res = await http.SendAsync(req);
if (!res.IsSuccessStatusCode)
  throw new InvalidOperationException($"confirm refused: {(int)res.StatusCode}");
// Disburse only after success.
```

When Aegis is unreachable under `enforce` + `allow_and_flag`, proceed only if your local
policy allows it, then later call confirm with `flagged_unavailable: true`. Under `block`,
do not execute.
