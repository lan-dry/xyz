# BYOK · Bank & insurance deck snippet (English)

Use this block in design-partner meetings, RFP responses, or slide speaker notes.

---

## Slide headline

**Customer-controlled keys (BYOK)** — your stamp, our verifier

---

## 30-second pitch

Every agent action in Aegis is an **Ed25519-signed** APS-1 event. With BYOK, you register only the **public key** in Console. The **private key never leaves your infrastructure** (AWS KMS, GCP Cloud KMS, HashiCorp Vault Transit, or agent-held HSM). Salanor **verifies** signatures on ingest; we cannot forge your audit trail because we do not hold signing material.

---

## How it works (plain language)

1. **Register** — Console → Agents → Register BYOK key → paste base64 public key (32 bytes).
2. **Sign** — Your SDK, agent, or KMS signs each event before `POST /v1/aegis/events`.
3. **Verify** — Aegis checks signature, payload hash, and per-agent hash chain.
4. **Witness** — Events batch into Merkle proofs (~60s) for third-party verification.
5. **Export** — Compliance bundles include the same wire format for offline audit.

---

## What we store vs what you keep

| You keep | Salanor stores |
|----------|----------------|
| Ed25519 **private** key (KMS / Vault / agent) | **Public** key only |
| IAM / HSM policies for who can sign | Signature verification + append-only ledger |
| Optional: AWS/GCP key ARN or Vault transit key name | Agent DID document binding key → agent |

---

## Signing modes (production)

| Mode | Best for | Salanor signs? |
|------|----------|----------------|
| **Customer-held** | Maximum custody separation | No — client signs only |
| **AWS KMS** | Workflow Bridge / server-side sign | Calls **your** KMS (your IAM) |
| **GCP Cloud KMS** | Same on GCP | Calls **your** KMS (your SA token) |
| **Vault Transit** | Existing HashiCorp stack | Calls **your** Vault (your token) |
| **Quick start** | Demo / pilot | Salanor generates key pair once; private key shown once |

---

## Regulator-friendly lines

- *"Undetected alteration of a signed event fails cryptographic verification."*
- *"The vendor cannot mint valid events as our agents without our private key."*
- *"Export the bundle and verify signatures independently — APS-1 is an open envelope format."*

---

## Demo script (5 minutes)

1. Console → Agents → create agent or register BYOK public key.
2. Ingest one signed event from SDK or curl (show `sig_value_b64`).
3. Traces → open trace → **Verify** → signature + chain OK.
4. Contrast: "If this were vendor-held keys only, you'd trust our word. Here you trust math."

---

## External dependencies (honest)

| Provider | What you need |
|----------|----------------|
| AWS KMS | Ed25519-capable KMS key + IAM role/credentials on bridge/worker |
| GCP KMS | Key version resource name + access token or workload identity |
| HashiCorp Vault | Transit engine + Ed25519 key + `VAULT_ADDR` + `VAULT_TOKEN` on aegis-api |
| None (customer-held) | SDK + private key on your side only |

Salanor does **not** need custody of your cloud accounts — only network reachability and credentials **you** provision for server-side sign paths.

---

## FAQ

**Q: What if we lose the private key?**  
A: Register a new BYOK key and rotate the agent binding. Old events remain verifiable with the old public key.

**Q: Can Salanor delete history?**  
A: BYOK prevents **forging** replacements. Deletion is an operator-trust question — mitigate with exports, witness batches, and your retention policy.

**Q: Is Vault fully supported?**  
A: Transit sign is implemented for Workflow Bridge when `kms_provider=vault` and transit key name is set. Client-held Vault (sign in your app) uses `customer` provider + public key registration.
