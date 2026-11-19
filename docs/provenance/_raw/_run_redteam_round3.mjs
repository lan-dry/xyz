import { readFileSync, writeFileSync, existsSync } from "node:fs";

const tenant = JSON.parse(
  readFileSync(".demo-tenant-local-stack.local.json", "utf8"),
);
const sim = (process.env.BANK_SIMULATOR_URL || "http://127.0.0.1:4000").replace(
  /\/+$/,
  "",
);
const lines = [];
const log = (m) => {
  console.log(m);
  lines.push(m);
};

log(`=== Red Team round3 ${new Date().toISOString()} ===`);
log(`org=${tenant.organization_id} api=${tenant.api_base} sim=${sim}`);

async function health(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return `${r.status}`;
  } catch (e) {
    return `DOWN (${e.cause?.code || e.message})`;
  }
}
log(`health sim ${await health(`${sim}/health`)}`);
log(`health api ${await health(`${tenant.api_base}/health`)}`);

let liveProven = 0;
let notVerifiedLive = 0;
let simulated = 0;
let fail = 0;

function classify(body, bad) {
  if (body.report_status === "FAIL" || bad.length || body.ok === false) {
    return "FAIL";
  }
  if (body.report_status === "Not verified live") return "Not verified live";
  if (body.report_status === "Simulated" || body.simulated === true) {
    return "Simulated";
  }
  return "Live";
}

for (let i = 1; i <= 18; i++) {
  const res = await fetch(`${sim}/api/redteam/run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-simulator": "1" },
    body: JSON.stringify({ attack_id: i }),
  });
  const body = await res.json().catch(() => ({}));
  const asserts = body.evidence?.assertions || [];
  const bad = asserts.filter((a) => a && a.ok === false);
  const bucket = classify(body, bad);
  if (bucket === "FAIL") fail++;
  else if (bucket === "Not verified live") notVerifiedLive++;
  else if (bucket === "Simulated") simulated++;
  else liveProven++;
  log(
    `#${i} [${body.label || "?"}/${bucket}] control=${JSON.stringify(body.evidence?.control ?? null)} attack=${JSON.stringify(body.evidence?.attack ?? null)} result=${body.result}`,
  );
  for (const a of asserts) {
    log(
      `  assert ${a.label} expected=${a.expected} actual=${a.actual} ${a.verdict || (a.ok ? "PASS" : "FAIL")}`,
    );
  }
  for (const s of body.steps || []) log(`    - ${s}`);
}

{
  const res = await fetch(`${sim}/api/honest-limit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-simulator": "1" },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  const asserts = body.evidence?.assertions || [];
  const bad = asserts.filter((a) => a && a.ok === false);
  const bucket = classify(body, bad);
  if (bucket === "FAIL") fail++;
  else if (bucket === "Not verified live") notVerifiedLive++;
  else if (bucket === "Simulated") simulated++;
  else liveProven++;
  log(
    `honest_limit [${body.label || "?"}/${bucket}] result=${body.result}`,
  );
  for (const a of asserts) {
    log(
      `  assert ${a.label} expected=${a.expected} actual=${a.actual} ${a.verdict || (a.ok ? "PASS" : "FAIL")}`,
    );
  }
}

log(
  `\nSUMMARY live-proven ${liveProven}, not verified live ${notVerifiedLive}, simulated ${simulated}${fail ? `, fail ${fail}` : ""}`,
);
log(fail ? "OVERALL: FAIL" : "OVERALL: PASS");
writeFileSync(
  "docs/provenance/_raw/redteam_round3.txt",
  lines.join("\n") + "\n",
  "utf8",
);
process.exit(fail ? 1 : 0);
