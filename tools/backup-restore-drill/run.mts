#!/usr/bin/env node
/**
 * Backup → restore → verify drill.
 * 1) pg_dump current DATABASE_URL
 * 2) Create temp DB, restore dump
 * 3) Run aegis-verify on a receipt bundle exported from the temp DB
 *    (or check event hash chain integrity if no receipts)
 *
 * Usage:
 *   pnpm exec tsx tools/backup-restore-drill/run.mts
 *
 * Env:
 *   DATABASE_URL — source DB (required)
 *   AEGIS_DRILL_PG_URL — optional admin URL to CREATE DATABASE (defaults to DATABASE_URL with /postgres)
 *   KEEP_DRILL_DB=true — skip DROP of temp DB
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} required`);
  return v;
}

function parseDbUrl(url: string): {
  base: string;
  dbName: string;
  adminUrl: string;
} {
  const u = new URL(url);
  const dbName = u.pathname.replace(/^\//, "") || "postgres";
  const admin = new URL(url);
  admin.pathname = "/postgres";
  return {
    base: url,
    dbName,
    adminUrl: process.env.AEGIS_DRILL_PG_URL?.trim() || admin.toString(),
  };
}

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const out = execFileSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out;
}

async function exportReceiptBundle(
  connectionString: string,
  outPath: string,
): Promise<{ hasReceipts: boolean; eventCount: number }> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const org = await client.query<{ organization_id: string }>(
      `SELECT organization_id FROM organization LIMIT 1`,
    );
    const orgId = org.rows[0]?.organization_id;
    if (!orgId) {
      writeFileSync(outPath, JSON.stringify({ receipts: [], keys: {} }));
      return { hasReceipts: false, eventCount: 0 };
    }

    const keys = await client.query<{ key_id: string; public_key_b64: string }>(
      `SELECT key_id, public_key_b64 FROM signing_key
       WHERE organization_id = $1 LIMIT 50`,
      [orgId],
    ).catch(() => ({ rows: [] as Array<{ key_id: string; public_key_b64: string }> }));

    const keyMap: Record<string, string> = {};
    for (const k of keys.rows) keyMap[k.key_id] = k.public_key_b64;

    const receipts = await client.query(
      `SELECT receipt_id, seq, prev_hash, receipt_hash, key_id, sig_alg,
              sig_value_b64, body, outcome
       FROM forensic_receipt
       WHERE organization_id = $1
       ORDER BY seq ASC
       LIMIT 50`,
      [orgId],
    ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

    const events = await client.query<{
      event_id: string;
      event_hash: string;
      sequence_num: string;
      prev_event_hash: string | null;
    }>(
      `SELECT event_id, event_hash, sequence_num::text, prev_event_hash
       FROM event WHERE organization_id = $1
       ORDER BY sequence_num ASC NULLS LAST LIMIT 100`,
      [orgId],
    );

    // Hash-chain spot check
    let chainOk = true;
    for (let i = 1; i < events.rows.length; i++) {
      const prev = events.rows[i - 1]!;
      const cur = events.rows[i]!;
      if (
        cur.prev_event_hash &&
        prev.event_hash &&
        cur.prev_event_hash !== prev.event_hash
      ) {
        chainOk = false;
        break;
      }
    }

    const signed = receipts.rows.map((r) => {
      const body =
        r.body && typeof r.body === "object"
          ? (r.body as Record<string, unknown>)
          : {};
      return {
        ...body,
        receipt_id: r.receipt_id,
        seq: Number(r.seq),
        prev_hash: r.prev_hash,
        receipt_hash: r.receipt_hash,
        key_id: r.key_id,
        sig_alg: r.sig_alg,
        sig_value_b64: r.sig_value_b64,
        outcome: r.outcome,
      };
    });

    writeFileSync(
      outPath,
      JSON.stringify(
        {
          receipts: signed,
          keys: keyMap,
          event_chain_ok: chainOk,
          event_count: events.rows.length,
        },
        null,
        2,
      ),
    );
    return {
      hasReceipts: signed.length > 0,
      eventCount: events.rows.length,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const backupOnly = args.includes("--backup");
  const restoreOnly = args.includes("--restore");
  const sourceUrl = requireEnv("DATABASE_URL");
  const { adminUrl } = parseDbUrl(sourceUrl);
  const drillName = `aegis_drill_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const work = process.env.AEGIS_BACKUP_DIR?.trim()
    ? resolve(process.env.AEGIS_BACKUP_DIR)
    : join(tmpdir(), "aegis-backup-restore-drill");
  mkdirSync(work, { recursive: true });
  const dumpPath = join(work, "dump.sql");
  const bundlePath = join(work, "bundle.json");
  const keysPath = join(work, "keys.json");

  console.log(`dump → ${dumpPath}`);
  try {
    run("pg_dump", ["--no-owner", "--no-acl", "-f", dumpPath, sourceUrl]);
  } catch (err) {
    console.error(
      "pg_dump failed — ensure PostgreSQL client tools are on PATH.",
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  }
  if (backupOnly) {
    console.log(`PASS: backup written to ${dumpPath}`);
    return;
  }
  if (restoreOnly && !existsSync(dumpPath)) {
    throw new Error(`--restore requires existing dump at ${dumpPath}`);
  }

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${drillName}`);
    console.log(`created temp DB ${drillName}`);
  } finally {
    await admin.end();
  }

  const restoreUrl = new URL(sourceUrl);
  restoreUrl.pathname = `/${drillName}`;
  const restoreConn = restoreUrl.toString();

  try {
    console.log("restore dump into temp DB…");
    run("psql", ["-v", "ON_ERROR_STOP=1", "-f", dumpPath, restoreConn]);

    const exported = await exportReceiptBundle(restoreConn, bundlePath);
    const bundle = JSON.parse(
      existsSync(bundlePath) ? readFileSync(bundlePath, "utf8") : "{}",
    ) as { keys?: Record<string, string>; event_chain_ok?: boolean };
    writeFileSync(keysPath, JSON.stringify(bundle.keys ?? {}, null, 2));

    if (exported.hasReceipts) {
      const cli = resolve("tools/aegis-verify/cli.mts");
      const result = spawnSync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["exec", "tsx", cli, bundlePath, "--keys", keysPath],
        { encoding: "utf8", cwd: resolve(".") },
      );
      console.log(result.stdout);
      if (result.status !== 0) {
        console.error(result.stderr);
        throw new Error("aegis-verify failed on restored DB receipts");
      }
      console.log("PASS: restored receipts verify");
    } else {
      if (bundle.event_chain_ok === false) {
        throw new Error("event hash chain broken after restore");
      }
      console.log(
        `PASS: restore ok; no receipts (events=${exported.eventCount}); hash chain spot-check ok`,
      );
    }
  } finally {
    if (process.env.KEEP_DRILL_DB !== "true") {
      const drop = new pg.Client({ connectionString: adminUrl });
      await drop.connect();
      try {
        await drop.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
          [drillName],
        );
        await drop.query(`DROP DATABASE IF EXISTS ${drillName}`);
        console.log(`dropped temp DB ${drillName}`);
      } finally {
        await drop.end();
      }
      rmSync(work, { recursive: true, force: true });
    } else {
      console.log(`KEEP_DRILL_DB: left ${drillName} and ${work}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
