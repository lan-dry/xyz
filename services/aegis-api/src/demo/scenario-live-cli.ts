#!/usr/bin/env node
/**
 * Live HTTP scenario runner — all 12 scenarios via running Aegis API.
 *
 * Calls POST /v1/aegis/demo/scenarios/run (requires AEGIS_DEMO_MODE on server;
 * refused when NODE_ENV/AEGIS_ENV=production).
 *
 * Approvals:
 *   default / --approvals=fixture — in-process checkApprovalAttempt (short-circuit)
 *   --approvals=http — scenarios 2,3,4,6,7 use real /approvals/request + console decide/release
 *
 * Contrast: `scenario:run` is in-process fixtures only (no HTTP / no DB).
 *
 * Usage:
 *   pnpm --filter aegis-api scenario:live
 *   pnpm --filter aegis-api scenario:live -- --approvals=http
 *   pnpm --filter aegis-api scenario:live -- 1,2,3
 */
function baseUrl(): string {
  return (process.env.AEGIS_API_BASE ?? "http://localhost:8080").replace(
    /\/$/,
    "",
  );
}

function ingestKey(): string {
  const key = process.env.AEGIS_INGEST_KEY?.trim();
  if (!key) {
    throw new Error("AEGIS_INGEST_KEY is required for scenario:live");
  }
  return key;
}

async function main() {
  const args = process.argv.slice(2);
  const approvalsArg = args.find((a) => a.startsWith("--approvals="));
  const approvals = approvalsArg?.split("=")[1] === "http" ? "http" : "fixture";
  const idArg = args.find((a) => !a.startsWith("--"));
  const ids =
    !idArg || idArg === "all"
      ? undefined
      : idArg
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n) && n > 0);

  const url = `${baseUrl()}/v1/aegis/demo/scenarios/run`;
  console.log(`scenario:live → ${url}`);
  console.log(`approvals_mode=${approvals}`);
  console.log(
    "Server must have AEGIS_DEMO_MODE=true (unavailable in production NODE_ENV/AEGIS_ENV)",
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(ids ? { ids } : {}),
      approvals,
    }),
  });

  const body = (await res.json()) as {
    error?: string;
    message?: string;
    failed?: number;
    approvals_mode?: string;
    results?: Array<{
      id: number;
      name: string;
      ok: boolean;
      detail: string;
      approvals?: string;
      receipt_kind?: string;
    }>;
  };

  if (!res.ok) {
    console.error(`HTTP ${res.status}`, body.error ?? body.message ?? body);
    process.exit(2);
  }

  console.log(`server_approvals_mode=${body.approvals_mode ?? "?"}`);
  let failed = 0;
  for (const r of body.results ?? []) {
    const ap = r.approvals ? ` [${r.approvals}]` : "";
    const rk = r.receipt_kind ? ` receipt_kind=${r.receipt_kind}` : "";
    console.log(
      `${r.ok ? "PASS" : "FAIL"} scenario ${r.id} ${r.name}${ap}${rk} — ${r.detail}`,
    );
    if (!r.ok) failed++;
  }
  console.log(`failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
