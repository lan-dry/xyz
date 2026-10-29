# Stoa — demo runbook (BK / Jean Luc meeting)

## Is Salanor ID normal?

**Yes.** One identity service (`salanor-id`) for **Stoa**, **Aegis Console**, and future products. On deployment:

- **SaaS:** `id.salanor.com` + `ai.customer.com` (Stoa UI) + Stoa API  
- **Bank private:** three containers from the same monorepo — **`salanor-id`**, **`stoa-web`**, **`stoa-gateway`** — in **their** Azure  

Employees **do not** create random accounts; **IT / admin** controls membership (Console invites or SSO group).

---

## Before the meeting (15 min)

1. Postgres: `aegis` (ID sessions) + `stoa` DB  
2. `.env.local` (minimum):

```env
DATABASE_URL=postgresql://...@.../aegis
STOA_DATABASE_URL=postgresql://...@.../stoa
SALANOR_ID_URL=http://127.0.0.1:8091
STOA_API_URL=http://127.0.0.1:8094
STOA_WORKSPACE_ORIGIN=http://localhost:3004
STOA_OPENAI_API_KEY=sk-...   # or accept dev echo without key
```

3. Migrate:

```bash
pnpm db:migrate
pnpm db:migrate:stoa
pnpm db:seed:stoa   # only if using dev tenant slug `local` without ID
```

4. Run:

```bash
pnpm dev:stoa
```

5. Open **http://localhost:3004/login** — sign in with an **admin** Console user (owner/admin role for `/admin` audit view).

---

## 5-minute demo script

1. **Problem:** “Staff use personal ChatGPT; you don’t see it; client data can leak.”  
2. **Sign in** with work account (Salanor ID → production: **Entra SSO**).  
3. **New chat** → paste text with an **email/phone** → show **redaction** note → model reply.  
4. **Model dropdown** → “IT enables which models; one workspace, one audit trail.”  
5. **Admin & audit** (if admin) → recent `message.completed` events with metadata (no manager snooping on drafts by default).  
6. **Architecture one-liner:** “Same platform later runs **in your Azure**; models stay **your** Azure OpenAI contract; Stoa is **policy + DLP + proof**.”  
7. **Aegis teaser:** “When bots **act** on APIs, same vendor adds approval and signed traces.”

---

## Attachments (secure path)

**Never send raw PDF/Word/image bytes to the model.** Pipeline:

1. Upload → type/size (+ optional ClamAV)  
2. **Extract text** (digital PDF / DOCX / TXT) **or OCR** (images + scanned PDFs; disable with `STOA_ATTACHMENT_OCR=0`)  
3. **Same DLP redaction** as chat messages  
4. **Images / scanned PDFs:** paint black boxes on a cleaned PNG preview (`redacted_storage_path`)  
5. Model receives **redacted text only** by default  

Optional: `STOA_VISION_REDACTED_IMAGES=1` also sends the **cleaned** PNG to vision models (never the original file).  

If extract/OCR fails → upload is **blocked** (fail closed).

**Demo UX:** on each attachment, open **What the model sees** — shows the redacted extract (and cleaned image preview when OCR/pixel path ran). Original file is never what the provider gets.

---

## What is not in this demo yet

- Enterprise SAML (configured per bank)  
- Full policy editor / SIEM export  
- Private Azure Helm deploy (story only)  
- Streaming tokens (messages are full round-trip)  
- Pixel-level redaction of digital (text-layer) PDFs — extract + redact is v1; painted preview is for images / scanned pages

---

*Internal — Salanor Ltd*
