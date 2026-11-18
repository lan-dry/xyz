#!/usr/bin/env node
/**
 * AEGIS-SRC1 conformance runner.
 *
 *   pnpm --filter @salanor/aegis-sdk build
 *   python -m pip install -r tools/independent-verify/requirements.txt
 *   node conformance/run.mjs [--skip-python] [--skip-check]
 *
 * 1. checks conformance/vectors.json is reproducible from the SDK (unless --skip-check)
 * 2. runs every vector against the TypeScript SDK
 * 3. runs every vector against tools/independent-verify/verify_envelope.py
 *
 * Set AEGIS_PYTHON to pick the interpreter (default: first of python3, python, py that has
 * the `cryptography` and `rfc8785` modules).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  eventHash,
  jcs,
  keyPairFromSeed,
  signEnvelope,
  signatureInputHex,
  verifyEnvelope,
} from "../packages/aegis-sdk/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const vectorsPath = join(here, "vectors.json");
const verifierPath = join(root, "tools", "independent-verify", "verify_envelope.py");
const args = new Set(process.argv.slice(2));

let failed = 0;
const fail = (msg) => {
  failed++;
  console.error(`FAIL ${msg}`);
};

// 1. reproducibility ---------------------------------------------------------
if (!args.has("--skip-check")) {
  const r = spawnSync(process.execPath, [join(here, "generate-vectors.mjs"), "--check"], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    fail("vectors.json is not reproducible from the SDK");
  }
}

// 2. TypeScript --------------------------------------------------------------
const data = JSON.parse(readFileSync(vectorsPath, "utf8"));
if (data.vectors.length < 12) {
  fail(`expected at least 12 vectors, found ${data.vectors.length}`);
}

for (const v of data.vectors) {
  const env = v.envelope_without_signature;
  const pair = await keyPairFromSeed(v.test_only_private_key_b64);
  const signed = await signEnvelope(env, v.test_only_private_key_b64);
  const verified = await verifyEnvelope({ ...env, signature: v.signature_b64url }, v.public_key_b64);
  const checks = {
    public_key: pair.publicKeyB64 === v.public_key_b64,
    event_jcs: jcs(env.event) === v.event_jcs,
    event_hash: eventHash(env.event) === v.event_hash && env.event_hash === v.event_hash,
    canonical_envelope_jcs: jcs(env) === v.canonical_envelope_jcs,
    canonical_envelope_utf8_hex:
      Buffer.from(jcs(env), "utf8").toString("hex") === v.canonical_envelope_utf8_hex,
    signature_input_hash: signatureInputHex(env) === v.signature_input_hash,
    signature: signed.signature === v.signature_b64url,
    verify: verified.ok === true,
  };
  for (const [name, ok] of Object.entries(checks)) {
    if (!ok) fail(`[typescript] ${v.id}: ${name}`);
  }
}

for (const v of data.negative_vectors) {
  const result = await verifyEnvelope(v.envelope, v.public_key_b64);
  if (result.ok || result.reason !== v.expected.reason) {
    fail(
      `[typescript] ${v.id}: expected ${v.expected.reason}, got ${result.ok ? "ok" : result.reason}`,
    );
  }
}
if (failed === 0) {
  console.log(
    `[typescript] ${data.vectors.length} positive + ${data.negative_vectors.length} negative vectors OK`,
  );
}

// 3. Python ------------------------------------------------------------------
if (args.has("--skip-python")) {
  console.log("[python] skipped");
} else {
  const candidates = process.env.AEGIS_PYTHON
    ? [[process.env.AEGIS_PYTHON]]
    : [["python3"], ["python"], ["py", "-3"]];
  let python;
  for (const [cmd, ...pre] of candidates) {
    const probe = spawnSync(cmd, [...pre, "-c", "import cryptography, rfc8785"], {
      stdio: "ignore",
    });
    if (probe.status === 0) {
      python = [cmd, ...pre];
      break;
    }
  }
  if (!python) {
    fail(
      "no Python with `cryptography` and `rfc8785` found; run: python -m pip install -r tools/independent-verify/requirements.txt (or set AEGIS_PYTHON / pass --skip-python)",
    );
  } else {
    const [cmd, ...pre] = python;
    const r = spawnSync(cmd, [...pre, verifierPath, "--vectors", vectorsPath], { stdio: "inherit" });
    if (r.status !== 0) {
      fail("[python] vector verification failed");
    }
  }
}

if (failed > 0) {
  console.error(`conformance: ${failed} failure(s)`);
  process.exit(1);
}
console.log("conformance: all legs passed");
