#!/usr/bin/env node
/**
 * Export sealed forensic receipt bundles for live scenarios 1–3 and 8 from DB,
 * run aegis-verify, then tamper a copy and expect verify to fail.
 *
 * Usage:
 *   pnpm --filter aegis-api export:scenario-bundles
 *   pnpm --filter aegis-api export:scenario-bundles -- --out ./tmp/bundles
 *
 * Requires DATABASE_URL and (for live seal) prior scenario:live intake.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import { getPool, closePool } from "../db/pool.js";
import { verifyForensicBundle } from "../forensic/verify-bundle.js";
import "../db/load-env.js";

/** All scenarios that can produce DB receipts on the live path. */
const SCENARIO_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

async function receiptDevPublicKeyB64(): Promise<{
  keyId: string;
  publicKeyB64: string;
} | null> {
  const privateKeyB64 =
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim() ||
    process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim();
  if (!privateKeyB64) return null;
  const privateKey = Buffer.from(privateKeyB64, "base64");
  if (privateKey.length !== 32) return null;
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    keyId: process.env.AEGIS_RECEIPT_KEY_ID?.trim() || "receipt_dev",
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
  };
}

async function loadOrgId(client: {
  query: (
    sql: string,
  ) => Promise<{ rows: Array<{ organization_id: string }> }>;
}): Promise<string> {
  const fromEnv =
    process.env.AEGIS_ORG_ID?.trim() ||
    process.env.AEGIS_ORGANIZATION_ID?.trim();
  if (fromEnv) return fromEnv;
  const row = await client.query(
    `SELECT organization_id FROM organization ORDER BY created_at ASC NULLS LAST LIMIT 1`,
  );
  if (!row.rows[0]) throw new Error("No organization in DB");
  return row.rows[0].organization_id;
}

async function exportBundles(outDir: string): Promise<{
  bundlePaths: string[];
  keysPath: string;
}> {
  const pool = getPool();
  const client = await pool.connect();
  const bundlePaths: string[] = [];
  try {
    const orgId = await loadOrgId(client);
    mkdirSync(outDir, { recursive: true });

    const keys = await client.query<{ key_id: string; public_key_b64: string }>(
      `SELECT key_id, public_key_b64 FROM signing_key
       WHERE organization_id = $1 AND COALESCE(revoked, false) = false`,
      [orgId],
    );
    const keyMap: Record<string, string> = {};
    for (const k of keys.rows) keyMap[k.key_id] = k.public_key_b64;
    const receiptKey = await receiptDevPublicKeyB64();
    if (receiptKey) keyMap[receiptKey.keyId] = receiptKey.publicKeyB64;
    const keysPath = join(outDir, "keys.json");
    writeFileSync(keysPath, JSON.stringify(keyMap, null, 2));

    for (const sid of SCENARIO_IDS) {
      // Latest single receipt for this scenario (preserves signature fields).
      // Bundle of one avoids cross-run seq gaps while still verifying seal + sig.
      const receipts = await client.query<{
        receipt_id: string;
        seq: string;
        prev_hash: string | null;
        receipt_hash: string;
        key_id: string;
        sig_alg: string;
        sig_value_b64: string;
        body: Record<string, unknown>;
        case_id: string | null;
        outcome: string;
      }>(
        `SELECT receipt_id, seq::text, prev_hash, receipt_hash, key_id, sig_alg,
                sig_value_b64, body, case_id, outcome
         FROM forensic_receipt
         WHERE organization_id = $1
           AND (case_id LIKE $2 OR body->>'case_id' LIKE $2)
         ORDER BY issued_at DESC
         LIMIT 1`,
        [orgId, `demo_s${sid}_%`],
      );

      const rows = receipts.rows;

      const sealed: Array<{
        event_id: string;
        event_hash: string;
        sequence_num: number;
      }> = [];
      const signedReceipts = rows.map((r) => {
        const body =
          r.body && typeof r.body === "object"
            ? { ...r.body }
            : {};
        const sealedEvents = Array.isArray(
          (body as { sealed_events?: unknown }).sealed_events,
        )
          ? ((body as { sealed_events: typeof sealed }).sealed_events)
          : [];
        for (const e of sealedEvents) sealed.push(e);
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
          sealed_events: sealedEvents,
        };
      });

      const bundle = {
        scenario_id: sid,
        organization_id: orgId,
        receipts: signedReceipts,
        sealed_events: sealed,
        keys: keyMap,
      };
      const path = join(outDir, `scenario-${sid}-bundle.json`);
      writeFileSync(path, JSON.stringify(bundle, null, 2));
      bundlePaths.push(path);
      console.log(`wrote ${path} receipts=${signedReceipts.length}`);
    }

    // Consecutive chain of at least five receipts for gap/swap/tamper tests.
    const chain = await client.query<{
      receipt_id: string;
      seq: string;
      prev_hash: string | null;
      receipt_hash: string;
      key_id: string;
      sig_alg: string;
      sig_value_b64: string;
      body: Record<string, unknown>;
      outcome: string;
    }>(
      `SELECT receipt_id, seq::text, prev_hash, receipt_hash, key_id, sig_alg,
              sig_value_b64, body, outcome
       FROM forensic_receipt
       WHERE organization_id = $1
       ORDER BY seq ASC
       LIMIT 20`,
      [orgId],
    );
    if (chain.rows.length >= 5) {
      const slice = chain.rows.slice(-5);
      const sealed: Array<{
        event_id: string;
        event_hash: string;
        sequence_num: number;
      }> = [];
      const signedReceipts = slice.map((r) => {
        const body = r.body && typeof r.body === "object" ? { ...r.body } : {};
        const sealedEvents = Array.isArray(
          (body as { sealed_events?: unknown }).sealed_events,
        )
          ? ((body as { sealed_events: typeof sealed }).sealed_events)
          : [];
        for (const e of sealedEvents) sealed.push(e);
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
          sealed_events: sealedEvents,
        };
      });
      const chainPath = join(outDir, "chain-5-bundle.json");
      writeFileSync(
        chainPath,
        JSON.stringify(
          {
            scenario_id: "chain-5",
            organization_id: orgId,
            receipts: signedReceipts,
            sealed_events: sealed,
            keys: keyMap,
          },
          null,
          2,
        ),
      );
      bundlePaths.push(chainPath);
      console.log(`wrote ${chainPath} receipts=${signedReceipts.length}`);
    } else {
      console.warn(
        `chain-5 skipped: only ${chain.rows.length} receipts (need >=5)`,
      );
    }

    return { bundlePaths, keysPath };
  } finally {
    client.release();
  }
}

async function runVerify(bundlePath: string, keysPath: string): Promise<{
  ok: boolean;
  output: string;
}> {
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
    receipts: Array<Record<string, unknown>>;
    keys?: Record<string, string>;
  };
  const keys = JSON.parse(readFileSync(keysPath, "utf8")) as Record<
    string,
    string
  >;
  const result = await verifyForensicBundle({
    receipts: bundle.receipts as never,
    keys: { ...keys, ...(bundle.keys ?? {}) },
  });
  const output = JSON.stringify(result, null, 2);
  return { ok: result.ok, output };
}

function tamperBundle(src: string, dest: string): void {
  const bundle = JSON.parse(readFileSync(src, "utf8")) as {
    receipts: Array<Record<string, unknown>>;
  };
  if (!bundle.receipts?.[0]) {
    writeFileSync(
      dest,
      JSON.stringify({ receipts: [{ outcome: "stop", receipt_hash: "sha256:tampered" }] }, null, 2),
    );
    return;
  }
  bundle.receipts[0]!.outcome = "stop";
  // Break hash so verifier fails
  const hash = String(bundle.receipts[0]!.receipt_hash ?? "");
  bundle.receipts[0]!.receipt_hash = hash
    ? `sha256:${createHash("sha256").update(hash + "|tamper").digest("hex")}`
    : "sha256:tampered";
  writeFileSync(dest, JSON.stringify(bundle, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outDir = resolve(
    outIdx >= 0 ? args[outIdx + 1]! : join(process.cwd(), "tmp", "scenario-bundles"),
  );

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(2);
  }

  const { bundlePaths, keysPath } = await exportBundles(outDir);
  let failed = 0;

  for (const path of bundlePaths) {
    const v = await runVerify(path, keysPath);
    console.log(`verify ${path}: ${v.ok ? "PASS" : "FAIL"}`);
    if (!v.ok) {
      console.log(v.output.slice(0, 800));
      const bundle = JSON.parse(readFileSync(path, "utf8")) as {
        receipts: unknown[];
      };
      if (!bundle.receipts?.length) {
        console.log(
          "  (no receipts in DB for this scenario — run scenario:live first)",
        );
      } else {
        failed++;
      }
    }
  }

  const sample = bundlePaths[0];
  if (sample && existsSync(sample)) {
    const tampered = join(outDir, "tampered-bundle.json");
    tamperBundle(sample, tampered);
    const v = await runVerify(tampered, keysPath);
    console.log(
      `tamper verify ${tampered}: ${v.ok ? "UNEXPECTED PASS" : "FAIL (expected)"}`,
    );
    if (v.ok) {
      console.error("Tampered bundle incorrectly verified");
      failed++;
    }
  }

  await closePool().catch(() => undefined);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => undefined);
  process.exit(2);
});
