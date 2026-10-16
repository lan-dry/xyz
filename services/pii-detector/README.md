# pii-detector

Finds names, postal addresses and dates of birth in message text, so Stoa can hide them before anything reaches an AI provider. Patterns in `stoa-api` already handle numbers (accounts, IBAN, cards, phones, IDs) and emails; this service covers what patterns can't.

First target: **Bank of Kigali (Rwanda)**. Message text is never logged and never leaves the host.

Model: [`fastino/gliner2-privacy-filter-PII-multi`](https://huggingface.co/fastino/gliner2-privacy-filter-PII-multi) (Apache 2.0, ~205M parameters, works on CPU).

## Run

```powershell
cd services/pii-detector
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PII_DEVICE = "cpu"
.\.venv\Scripts\python.exe app.py
```

The first start downloads the model into the Hugging Face cache. It listens on `http://127.0.0.1:8095`.

| Variable | Default |
| --- | --- |
| `PII_PORT` | `8095` |
| `PII_HOST` | `127.0.0.1` |
| `PII_DEVICE` | `auto` (`cuda`, `cpu`, or `auto`) |
| `PII_MODEL` | `fastino/gliner2-privacy-filter-PII-multi` |

## Connect stoa-api

In `services/stoa-api/.env`:

```
STOA_PII_DETECTOR_URL=http://127.0.0.1:8095
STOA_PII_DETECTOR_THRESHOLD=0.5
```

When the URL is set and the service is down, messages are refused instead of being sent with names visible. `STOA_PII_DETECTOR_OPTIONAL=1` falls back to patterns only.

## Measure (Rwanda / BK)

`eval/bank-messages.jsonl` holds labelled bank messages for a Rwanda branch (RWF, +250, Rwandan national IDs, Kigali addresses, BK-style accounts). Each line lists values that must be hidden (`sensitive`) and values the AI needs (`keep`: amounts, dates, places, company names).

```powershell
cd services/stoa-api
pnpm eval:detection
pnpm eval:detection --verbose
```

### Latest baseline (70 messages, threshold 0.5)

| | Patterns only | Patterns + GLiNER2 |
| --- | ---: | ---: |
| Sensitive values hidden | 36.9% | **95.0%** |
| Names | 0% | **95.8%** |
| Dates of birth | 0% | **100%** |
| Values that must stay (amounts, places) | 100% | 94.2% |

Remaining leaks are mostly partial addresses and a few first names. Places like "Paris" or "Dubai" are sometimes hidden when the model treats them as addresses; raise `STOA_PII_DETECTOR_THRESHOLD` toward `0.7` if that becomes noisy.
