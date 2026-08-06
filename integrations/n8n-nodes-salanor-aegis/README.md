# n8n-nodes-salanor-aegis

Community node package for [Salanor Aegis](https://salanor.com) in n8n.

## What it does

| Operation | When to use | Policies |
|-----------|-------------|----------|
| **Record Run** | One node at the **end** of the workflow | Audit / provenance after the fact |
| **Check Policy** | Immediately **before** a risky tool (payment, delete, send) | Can **deny** and stop the branch |
| Start / Complete | Advanced multi-call | Same as HTTP bridge |

**Honest limit:** n8n cannot auto-wrap every native node. For live blocking, place **Check Policy** before the dangerous step. For signed proof of the whole run, place **Record Run** at the end (pack LLM/tool previews in Nodes JSON).

## Install (local n8n)

```bash
cd ~/.n8n
# or your n8n custom dir
npm install /path/to/salanor/integrations/n8n-nodes-salanor-aegis
```

Or in n8n Settings → Community nodes → install `n8n-nodes-salanor-aegis` once published to npm.

Build first:

```bash
cd integrations/n8n-nodes-salanor-aegis
npm install
npm run build
```

## Credentials

- **API Base URL:** `https://api.salanor.com`
- **Ingest API Key:** from Console → API keys  
- Agent must have **Workflow Bridge on**

## Prerequisites on Salanor

`aegis-api` must run a build that supports **one-shot** on `POST /v1/aegis/workflows/runs` (`one_shot` / `execution` in body). If traces stay `RUNNING` with only `aegis.trace.start`, Railway is still on an old commit — deploy latest `main`.
