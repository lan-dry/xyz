/**
 * Stub demo client — submits a synthetic retail_loan event to Aegis.
 * Not a production bank-core integration.
 */
const base = process.env.AEGIS_API_BASE ?? "http://localhost:8080";
const key = process.env.AEGIS_INGEST_KEY;
if (!key) {
  console.error("Set AEGIS_INGEST_KEY");
  process.exit(1);
}

const amount = Number(process.env.LOAN_AMOUNT ?? "3000000");
const body = {
  schema_version: 1,
  case_id: `loan-${Date.now()}`,
  idempotency_key: `idem-${Date.now()}`,
  event_type: "loan_decision",
  product: "retail_loan",
  emitted_at: new Date().toISOString(),
  attributes: {
    amount,
    currency: "RWF",
  },
};

const res = await fetch(`${base}/v1/aegis/bank/events`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Idempotency-Key": body.idempotency_key,
  },
  body: JSON.stringify(body),
});

const json = (await res.json()) as {
  outcome?: string;
  approval?: unknown;
};
console.log(res.status, JSON.stringify(json, null, 2));
if (!res.ok) process.exit(1);

if (json.outcome === "stop") {
  console.log("Bank core: refuse to proceed");
} else if (json.outcome === "hold") {
  console.log("Bank core: wait for approval", json.approval);
} else {
  console.log("Bank core: proceed");
}
