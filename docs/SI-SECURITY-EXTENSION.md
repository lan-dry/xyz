# SI security extension · Architecture note

**Status:** Architecture and sales narrative. Not a shipped product module today.

---

## What the buyer asked

Can Salanor cover **SI (systems information) security** as an extension of Aegis, especially where **personal information** is involved?

**Short answer:** Yes as a **designed extension**, deployed **on the client's infrastructure** or as a **managed edge service** tied to their identity and data boundaries. It is **not** the same binary as Aegis core today.

---

## Two layers (keep this diagram in meetings)

```
[ Employees / AI tools / browsers ]
           |
           v
  SI SECURITY LAYER (client-side or VPC)
  - Prompt / request inspection (DLP)
  - PII detection and redaction
  - Allow-list models and endpoints
  - Route tool/API calls to Aegis
           |
           v
  AEGIS (Salanor · ships today)
  - Policy: allow / deny / require approval
  - Named human approver
  - Signed trace + audit export
           |
           v
  Core systems (banking, claims, e-commerce ops)
```

---

## Why separate from Aegis core

| Topic | SI layer | Aegis |
|-------|----------|-------|
| Touches raw prompts and PII | Often yes | Minimized (metadata + governed actions) |
| Deployment | Client VPC, proxy, browser extension | Salanor cloud or client-hosted Aegis API |
| Regulation | POPIA, GDPR processing, DLP policies | Operational control and proof |
| What we sell today | Architecture + integration project | Product + workflow implementation |

Aegis **does not** need to read every employee prompt to govern a **payment** or **export**. The SI layer can decide what reaches an agent; Aegis decides whether the **action** executes and leaves proof.

---

## Feasible integration patterns

1. **API gateway**  
   Internal AI/copilot calls `payments.transfer` through gateway → Aegis policy check → core API.

2. **n8n / orchestrator** (current demo pattern)  
   Workflow bridge + Check Policy node. SI layer optional upstream.

3. **Corporate proxy** (roadmap)  
   Forward selected tool calls to Aegis ingest; block or require approval before forward.

4. **BYOK signing**  
   Production core integrations: client holds private keys; Salanor verifies.

---

## What to promise in 2026 Q1 sales

| Promise | OK |
|---------|-----|
| Aegis on actions (pay, export, limit change, claim) | Yes |
| SI architecture workshop with their IT security | Yes |
| Design document for gateway + Aegis routing | Yes |
| Full enterprise DLP / prompt firewall product | No (unless scoped SOW + build) |
| Salanor stores full PAN / national ID in traces | No |

---

## Next engineering artifact (when a buyer is serious)

1. OpenAPI for policy evaluate + approval (exists)  
2. Reference **gateway middleware** (Node) that calls evaluate before proxy  
3. Data minimization guide for SI + Aegis joint deployment  

Track as **B-SI-001** in backlog when first SI workshop is booked.

---

## One sentence for Landry

> "Aegis governs the action at the boundary. SI security sits in front and keeps PII under your control. We can design both together; today we ship the action layer and implement the SI edge with your security team."
