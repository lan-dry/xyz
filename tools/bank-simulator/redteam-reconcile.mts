/**
 * Live Red Team helper: create feed → ingest → run reconciliation (or collector path).
 * Invoked as: pnpm exec tsx tools/bank-simulator/redteam-reconcile.mts <json-args>
 * Prints one JSON line: { ok, kind, found, reason?, exceptions? }
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createFeed, ingestFeedBody } from "../../services/aegis-api/src/reconciliation/ingest.js";
import { runReconciliation } from "../../services/aegis-api/src/reconciliation/run.js";
import { insertCollectorCdcEvent } from "../../services/aegis-api/src/reconciliation/collector-match.js";
function loadEnv() {
  const root = resolve(process.cwd());
  for (const p of [".env", ".env.local", "services/aegis-api/.env"]) {
    const full = resolve(root, p);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  }
}

function orgId(): string | null {
  if (process.env.AEGIS_ORGANIZATION_ID) return process.env.AEGIS_ORGANIZATION_ID;
  const tenantPath = resolve(".demo-tenant-local-stack.local.json");
  if (existsSync(tenantPath)) {
    const t = JSON.parse(readFileSync(tenantPath, "utf8"));
    return t.organization_id ?? null;
  }
  return null;
}

async function main() {
  loadEnv();
  const rawArg = process.argv[2] || "{}";
  const argsJson = (
    rawArg.endsWith(".json") && existsSync(rawArg)
      ? readFileSync(rawArg, "utf8")
      : rawArg
  ).replace(/^\uFEFF/, "");
  const args = JSON.parse(argsJson) as {
    kind: string;
    case_id: string;
    amount?: number;
    beneficiary_account?: string;
    external_id?: string;
    feed_body?: string;
    feed_format?: string;
  };
  const org = orgId();
  if (!process.env.DATABASE_URL || !org) {
    console.log(
      JSON.stringify({
        ok: false,
        found: false,
        reason: "DATABASE_URL or organization_id missing",
      }),
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const now = new Date();
  const period_start = new Date(now.getTime() - 7 * 86400000).toISOString();
  const period_end = new Date(now.getTime() + 3600000).toISOString();

  try {
    if (args.kind === "db_change_without_event") {
      await insertCollectorCdcEvent(pool, {
        organization_id: org,
        source_id: "src_core_cdc",
        case_id: args.case_id,
        table_name: "ledger_entry",
        operation: "update",
        row_key: { case_id: args.case_id, txn_id: args.external_id ?? null },
        new_values_hash: "a".repeat(64),
        lsn: `0/${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        captured_at: now.toISOString(),
      });
      const result = await runReconciliation(pool, {
        organization_id: org,
        period_start,
        period_end,
        trigger: "on_demand",
        now,
      });
      const found = result.exceptions.some(
        (e) => e.kind === "db_change_without_event" && e.case_id === args.case_id,
      );
      console.log(
        JSON.stringify({
          ok: true,
          found,
          kind: "db_change_without_event",
          reason: found
            ? undefined
            : "collector CDC ingested; reconcile did not raise db_change_without_event",
          exception_kinds: result.exceptions.map((e) => e.kind),
        }),
      );
      return;
    }

    const feed = await createFeed(pool, {
      organization_id: org,
      name: `redteam-${args.kind}-${Date.now()}`,
      match_key: "case_id",
    });

    const body =
      args.feed_body ??
      JSON.stringify({
        case_id: args.case_id,
        amount: String(args.amount ?? 0),
        beneficiary_account: args.beneficiary_account ?? "X",
        executed_at: now.toISOString(),
        external_id: args.external_id ?? `txn_${args.case_id}`,
      });

    await ingestFeedBody(
      pool,
      org,
      feed.feed_id,
      body,
      args.feed_format === "jsonl" ? "jsonl" : "json",
    );

    const result = await runReconciliation(pool, {
      organization_id: org,
      feed_id: feed.feed_id,
      period_start,
      period_end,
      trigger: "on_demand",
      now,
    });
    const found = result.exceptions.some(
      (e) => e.kind === args.kind && e.case_id === args.case_id,
    );
    console.log(
      JSON.stringify({
        ok: true,
        found,
        kind: args.kind,
        feed_id: feed.feed_id,
        reason: found
          ? undefined
          : `ingest+reconcile ran; ${args.kind} not raised for ${args.case_id}`,
        exception_kinds: result.exceptions.map((e) => e.kind),
      }),
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        found: false,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
  } finally {
    await pool.end();
  }
}

main();
