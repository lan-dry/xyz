#!/usr/bin/env node
/**
 * Upgrade check: stop at 013 (before 014/015), apply through tip (015), seed
 * forensic receipts, migrate to tip again (no-op until 016+), then verify.
 *
 * Prefer a fresh empty database (AEGIS_UPGRADE_DATABASE_URL). Scratch DBs whose
 * name contains "upgrade" are dropped and recreated automatically.
 *
 * Usage: pnpm exec tsx tools/scripts/upgrade-migrate-check.mts
 */
import { pathToFileURL } from "node:url";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(root);
const requireFromApi = createRequire(
  join(root, "services/aegis-api/package.json"),
);
const ed = requireFromApi("@noble/ed25519") as typeof import("@noble/ed25519");
const pg = requireFromApi("pg") as typeof import("pg");

if (process.env.AEGIS_UPGRADE_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.AEGIS_UPGRADE_DATABASE_URL.trim();
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
}

await import(pathToFileURL(join(root, "services/aegis-api/src/db/load-env.js")).href);
const { migrateUp } = await import(
  pathToFileURL(join(root, "services/aegis-api/src/db/migrate.js")).href
);
const { getPool, closePool } = await import(
  pathToFileURL(join(root, "services/aegis-api/src/db/pool.js")).href
);

/** Stop here so 014/015 are the upgrade window under test. */
const BASELINE_TAG_SCHEMA = "013_db_value_mismatch";
/**
 * Seed after the current tip of the chain (receipt_signing_key is in 001_baseline).
 * When 016+ land, keep seeding at this version and let the final migrateUp() cover tip.
 */
const RECEIPT_SCHEMA = "015_demo_tenant_ops";

async function recreateUpgradeDbIfNeeded(databaseUrl: string): Promise<void> {
  const u = new URL(databaseUrl);
  const dbName = u.pathname.replace(/^\//, "") || "";
  const force = process.env.AEGIS_UPGRADE_RECREATE === "true";
  const looksScratch = /upgrade/i.test(dbName);
  if (!force && !looksScratch) return;
  if (!dbName || dbName === "postgres" || dbName === "aegis") {
    throw new Error(
      "Refusing to recreate primary DB; set AEGIS_UPGRADE_DATABASE_URL to …/aegis_upgrade",
    );
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
    throw new Error(`Unsafe upgrade DB name: ${dbName}`);
  }
  const admin = new URL(databaseUrl);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`recreated empty DB ${dbName} for baseline@013 upgrade check`);
  } finally {
    await client.end();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL (or AEGIS_UPGRADE_DATABASE_URL) required");
    process.exit(2);
  }

  await recreateUpgradeDbIfNeeded(process.env.DATABASE_URL);
  const pool = getPool();
  const orgId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const work = join(tmpdir(), `aegis-upgrade-${randomUUID().slice(0, 8)}`);
  mkdirSync(work, { recursive: true });
  const bundlePath = join(work, "bundle.json");
  const keysPath = join(work, "keys.json");

  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const privateKeyB64 = Buffer.from(privateKey).toString("base64");
  const publicKeyB64 = Buffer.from(publicKey).toString("base64");
  const keyId = "receipt_upgrade";
  process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = privateKeyB64;
  process.env.AEGIS_RECEIPT_KEY_ID = keyId;

  try {
    console.log(
      `migrateUp through ${BASELINE_TAG_SCHEMA} (before 014/015 upgrade window)…`,
    );
    await migrateUp({ throughVersion: BASELINE_TAG_SCHEMA });

    {
      const probe = await pool.connect();
      try {
        const versions = await probe.query(
          `SELECT version FROM schema_migration ORDER BY version`,
        );
        console.log(
          "migrations at baseline (pre-014):",
          versions.rows.map((r: { version: string }) => r.version).join(", "),
        );
        if (
          versions.rows.some((r: { version: string }) =>
            /^(014|015|01[6-9]|0[2-9])/.test(r.version),
          )
        ) {
          throw new Error(
            "baseline stop failed: 014+ already applied before seed window",
          );
        }
        if (
          !versions.rows.some(
            (r: { version: string }) => r.version === BASELINE_TAG_SCHEMA,
          )
        ) {
          throw new Error(
            `baseline stop failed: ${BASELINE_TAG_SCHEMA} not applied (throughVersion miss?)`,
          );
        }
      } finally {
        probe.release();
      }
    }

    console.log(`migrateUp through ${RECEIPT_SCHEMA} (current tip / seed)…`);
    await migrateUp({ throughVersion: RECEIPT_SCHEMA });

    {
      const client = await pool.connect();
      try {
        await client
          .query(
            `INSERT INTO organization (organization_id, name, slug)
             VALUES ($1, 'Upgrade Check Org', 'upgrade-check')
             ON CONFLICT (organization_id) DO NOTHING`,
            [orgId],
          )
          .catch(async () => {
            await client.query(
              `INSERT INTO organization (organization_id, name)
               VALUES ($1, 'Upgrade Check Org')
               ON CONFLICT DO NOTHING`,
              [orgId],
            );
          });

        const { issueForensicReceipt } = await import(
          pathToFileURL(
            join(root, "services/aegis-api/src/forensic/issue.js"),
          ).href
        );

        const seededSeqs: number[] = [];
        for (let i = 0; i < 3; i++) {
          const issued = await issueForensicReceipt(client, {
            organization_id: orgId,
            case_id: `upgrade_case_${i}_${randomUUID().slice(0, 6)}`,
            decision_id: `upgrade_dec_${i}`,
            outcome: "allow",
            mode: "enforce",
            matched_rules: [],
            sealed_events: [
              {
                event_id: `evt_upgrade_${i}_${randomUUID().slice(0, 6)}`,
                event_hash: `sha256:${createHash("sha256").update(String(i)).digest("hex")}`,
                sequence_num: i + 1,
              },
            ],
            signingKey: { key_id: keyId, private_key_b64: privateKeyB64 },
          });
          seededSeqs.push(issued.seq);
        }
        console.log(
          `seeded receipts at ${RECEIPT_SCHEMA} (after baseline@${BASELINE_TAG_SCHEMA}): seq=${seededSeqs.join(",")}`,
        );
      } finally {
        client.release();
      }
    }

    console.log("migrateUp to current tip…");
    await migrateUp();

    const verifyClient = await pool.connect();
    try {
      const after = await verifyClient.query(
        `SELECT version FROM schema_migration ORDER BY version`,
      );
      console.log(
        "migrations after upgrade:",
        after.rows.map((r: { version: string }) => r.version).join(", "),
      );

      const rows = await verifyClient.query<{
        receipt_id: string;
        seq: string;
        body: Record<string, unknown>;
        key_id: string;
        sig_alg: string;
        sig_value_b64: string;
        receipt_hash: string;
        prev_hash: string | null;
      }>(
        `SELECT receipt_id, seq::text, body, key_id, sig_alg, sig_value_b64,
                receipt_hash, prev_hash
         FROM forensic_receipt
         WHERE organization_id = $1
         ORDER BY seq ASC`,
        [orgId],
      );
      console.log(`forensic_receipt after migrate: ${rows.rows.length}`);
      if (rows.rows.length < 3) {
        throw new Error("seeded receipts missing after migrate");
      }

      const receipts = rows.rows.map((r) => {
        const body =
          r.body && typeof r.body === "object" ? { ...r.body } : {};
        return {
          ...body,
          receipt_id: r.receipt_id,
          seq: Number(r.seq),
          prev_hash: r.prev_hash,
          receipt_hash: r.receipt_hash,
          key_id: r.key_id,
          sig_alg: r.sig_alg,
          sig_value_b64: r.sig_value_b64,
        };
      });

      writeFileSync(
        bundlePath,
        JSON.stringify({ receipts, keys: { [keyId]: publicKeyB64 } }, null, 2),
      );
      writeFileSync(
        keysPath,
        JSON.stringify({ [keyId]: publicKeyB64 }, null, 2),
      );

      const { verifyForensicBundle } = await import(
        pathToFileURL(
          join(root, "services/aegis-api/src/forensic/verify-bundle.js"),
        ).href
      );
      const verified = await verifyForensicBundle({
        receipts: receipts as never,
        keys: { [keyId]: publicKeyB64 },
      });
      console.log("aegis-verify (in-process):", JSON.stringify(verified));
      if (!verified.ok) {
        throw new Error(
          `aegis-verify failed on receipts seeded after baseline@${BASELINE_TAG_SCHEMA}: ${JSON.stringify(verified.findings)}`,
        );
      }
      const cli = resolve(root, "tools/aegis-verify/cli.mts");
      const result = spawnSync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["exec", "tsx", cli, bundlePath, "--keys", keysPath],
        { encoding: "utf8", cwd: root },
      );
      console.log(
        result.stdout || result.stderr || `cli_status=${result.status}`,
      );

      for (const table of [
        "policy",
        "event",
        "forensic_receipt",
        "approval_delegate",
      ]) {
        const exists = await verifyClient.query(
          `SELECT to_regclass($1) IS NOT NULL AS ok`,
          [`public.${table}`],
        );
        if (!exists.rows[0]?.ok) {
          console.log(`${table}: missing`);
          continue;
        }
        const n = await verifyClient.query(
          `SELECT COUNT(*)::text AS n FROM ${table}`,
        );
        console.log(`${table}: ${n.rows[0].n}`);
      }
      console.log(
        `PASS: upgrade migrate check completed (baseline@${BASELINE_TAG_SCHEMA}→${RECEIPT_SCHEMA} seed→tip→verify)`,
      );
    } finally {
      verifyClient.release();
    }
  } finally {
    await closePool();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
