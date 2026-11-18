#!/usr/bin/env node
/**
 * Generates conformance/vectors.json using @salanor/aegis-sdk.
 *
 *   pnpm --filter @salanor/aegis-sdk build
 *   node conformance/generate-vectors.mjs           # (re)write conformance/vectors.json
 *   node conformance/generate-vectors.mjs --check   # fail if the committed file is stale
 *
 * Ed25519 signatures are deterministic, so the output is reproducible.
 * ALL KEYS IN THE OUTPUT ARE PUBLISHED TEST-ONLY KEYS. NEVER use them anywhere real.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildEnvelope,
  eventHash,
  jcs,
  keyPairFromSeed,
  signEnvelope,
  signatureInputHex,
  verifyEnvelope,
} from "../packages/aegis-sdk/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "vectors.json");

/** Deterministic test-only seeds: 32 bytes filled with a single repeated value. */
function testSeed(fill) {
  return Buffer.alloc(32, fill).toString("base64");
}

const SEED_A = testSeed(0x11);
const SEED_B = testSeed(0x22);
const SEED_C = testSeed(0x33);

const BASE_TS = "2026-11-18T10:01:22.123Z";
const BASE_NONCE = "AAECAwQFBgcICQoLDA0ODw"; // base64url(00 01 02 ... 0f)
const BASE_IDEM = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

/** Test cases. `event` objects are written to the vectors file in insertion order. */
const cases = [
  {
    id: "minimal-ascii",
    description: "Smallest realistic event; ASCII only.",
    seed: SEED_A,
    seq: 1,
    event: { type: "loan.approved", loan_id: "LN-0001" },
  },
  {
    id: "empty-object-event",
    description: "Event is an empty object; JCS(event) is {}.",
    seed: SEED_A,
    seq: 2,
    event: {},
  },
  {
    id: "money-decimal-strings",
    description:
      "Money is always a decimal string, never a float. Preserves trailing zeros and >2^53 magnitudes.",
    seed: SEED_A,
    seq: 1042,
    source_id: "src_los",
    key_id: "k_los_2026_01",
    event: {
      type: "payout.requested",
      amount: "1234.50",
      fee: "0.10",
      balance: "1234567890123456789.99",
      refund: "-5.00",
      zero: "0",
      currency: "USD",
    },
  },
  {
    id: "unicode-strings",
    description:
      "BMP and astral characters in values; emitted as raw UTF-8, not escaped. NFC and NFD forms stay distinct.",
    seed: SEED_A,
    seq: 3,
    event: {
      greeting: "Grüße, 世界 🌍",
      nfc: "\u00e9",
      nfd: "e\u0301",
      rtl: "שלום",
      emoji_zwj: "👨‍👩‍👧",
    },
  },
  {
    id: "unicode-names",
    description: "Customer names with diacritics and non-Latin scripts.",
    seed: SEED_B,
    seq: 4,
    source_id: "src_crm",
    key_id: "k_crm_2026_02",
    event: {
      type: "customer.updated",
      first_name: "Zoë",
      last_name: "Nguyễn",
      aliases: ["Иван Петров", "李小龍", "محمد"],
    },
  },
  {
    id: "unicode-key-sort-utf16",
    description:
      "JCS sorts keys by UTF-16 code units: U+1F600 (D83D DE00) sorts before U+FFFF, unlike UTF-8/code point order.",
    seed: SEED_A,
    seq: 5,
    event: { "\uffff": 1, "😀": 2, é: 3, z: 4, a: 5, Z: 6, "": 7 },
  },
  {
    id: "nested-objects",
    description: "Deeply nested objects with unsorted keys; numeric-looking keys sort as strings.",
    seed: SEED_A,
    seq: 6,
    event: {
      z: { y: { x: { w: "deep" } }, b: 1 },
      a: { "10": "ten", "9": "nine", "2": "two" },
      m: { k2: null, k1: { inner: [] } },
    },
  },
  {
    id: "nested-arrays",
    description: "Arrays of arrays and arrays of objects; array order is preserved.",
    seed: SEED_A,
    seq: 7,
    event: {
      matrix: [[1, 2], [3, [4, 5, [6]]], []],
      items: [{ b: 2, a: 1 }, { d: 4, c: 3 }],
      mixed: [1, "two", true, null, { three: 3 }, [4]],
    },
  },
  {
    id: "empty-arrays-and-objects",
    description: "Empty arrays and empty nested objects.",
    seed: SEED_A,
    seq: 8,
    event: { list: [], map: {}, nested: { list: [[]], map: { inner: {} } } },
  },
  {
    id: "booleans-and-null",
    description: "Boolean and null values; null fields are kept (JCS does not drop them).",
    seed: SEED_B,
    seq: 9,
    event: { approved: true, rejected: false, reviewer: null, notes: null, flags: [true, false, null] },
  },
  {
    id: "integer-edge-cases",
    description:
      "Integer edge cases within the safe range (floats are not allowed in events): 0, negatives, +/-(2^53-1).",
    seed: SEED_A,
    seq: 10,
    event: {
      zero: 0,
      one: 1,
      minus_one: -1,
      thousand: 1000,
      million: 1000000,
      max_safe: 9007199254740991,
      min_safe: -9007199254740991,
      pow2_32: 4294967296,
    },
  },
  {
    id: "large-seq",
    description: "seq at Number.MAX_SAFE_INTEGER.",
    seed: SEED_A,
    seq: 9007199254740991,
    event: { type: "heartbeat" },
  },
  {
    id: "string-escapes",
    description:
      "JCS string escaping: quotes, backslash, \\b \\f \\n \\r \\t, other control chars as \\u00xx lowercase, DEL and U+2028 raw, / and < unescaped.",
    seed: SEED_A,
    seq: 11,
    event: {
      quote: 'say "hi"',
      backslash: "C:\\temp\\file",
      controls: "\b\f\n\r\t\u0000\u0001\u001f",
      del: "\u007f",
      line_sep: "\u2028\u2029",
      slashes: "a/b</script>",
    },
  },
  {
    id: "different-source-and-key",
    description: "Different source_id and key_id feed the signature-input prefix.",
    seed: SEED_C,
    seq: 77,
    source_id: "src_core.banking:eu-1",
    key_id: "k_cb_2027_12",
    ts: "2027-12-31T23:59:59.999Z",
    event: { type: "ledger.closed", period: "2027-12", entries: 120345 },
  },
  {
    id: "many-keys-insertion-order",
    description: "Many keys inserted in reverse order; output order is determined by JCS only.",
    seed: SEED_A,
    seq: 12,
    event: Object.fromEntries(
      [..."zyxwvutsrqponmlkjihgfedcba"].map((k, i) => [`field_${k}`, i]),
    ),
  },
];

async function makeVector(c) {
  const pair = await keyPairFromSeed(c.seed);
  const unsigned = buildEnvelope({
    source_id: c.source_id ?? "src_los",
    key_id: c.key_id ?? "k_los_2026_01",
    seq: c.seq,
    ts: c.ts ?? BASE_TS,
    nonce: BASE_NONCE,
    idempotency_key: BASE_IDEM,
    event: c.event,
  });
  const signed = await signEnvelope(unsigned, c.seed);
  const verify = await verifyEnvelope(signed, pair.publicKeyB64);
  if (!verify.ok) {
    throw new Error(`self-check failed for ${c.id}: ${JSON.stringify(verify)}`);
  }
  const { signature, ...withoutSignature } = signed;
  const envelopeJcs = jcs(withoutSignature);
  return {
    id: c.id,
    description: c.description,
    test_only_private_key_b64: pair.privateKeyB64,
    public_key_b64: pair.publicKeyB64,
    envelope_without_signature: withoutSignature,
    event_jcs: jcs(c.event),
    canonical_envelope_jcs: envelopeJcs,
    canonical_envelope_utf8_hex: Buffer.from(envelopeJcs, "utf8").toString("hex"),
    event_hash: eventHash(c.event),
    signature_input_hash: signatureInputHex(signed),
    signature_b64url: signature,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function makeNegatives(vectors) {
  const byId = Object.fromEntries(vectors.map((v) => [v.id, v]));
  const base = byId["money-decimal-strings"];
  const other = byId["minimal-ascii"];
  const full = (v) => ({ ...v.envelope_without_signature, signature: v.signature_b64url });
  const pairC = await keyPairFromSeed(SEED_C);

  const out = [];
  const add = (id, description, envelope, expected_reason, publicKey = base.public_key_b64) => {
    out.push({
      id,
      description,
      public_key_b64: publicKey,
      envelope,
      expected: { ok: false, reason: expected_reason },
    });
  };

  add(
    "forged-signature",
    "Signature copied from a different envelope signed by the same key.",
    { ...full(base), signature: other.signature_b64url },
    "bad_signature",
  );

  const flipped = Buffer.from(base.signature_b64url, "base64url");
  flipped[0] ^= 0x01;
  add(
    "bit-flipped-signature",
    "One bit flipped in the signature.",
    { ...full(base), signature: flipped.toString("base64url") },
    "bad_signature",
  );

  const tamperedEvent = full(base);
  tamperedEvent.event = clone(tamperedEvent.event);
  tamperedEvent.event.amount = "9999.99";
  add(
    "tampered-event",
    "Event amount changed without updating event_hash.",
    tamperedEvent,
    "event_hash_mismatch",
  );

  const rehashed = clone(tamperedEvent);
  rehashed.event_hash = eventHash(rehashed.event);
  add(
    "tampered-event-rehashed",
    "Event changed and event_hash recomputed, but the original signature is kept.",
    rehashed,
    "bad_signature",
  );

  add(
    "tampered-seq",
    "seq changed after signing.",
    { ...full(base), seq: base.envelope_without_signature.seq + 1 },
    "bad_signature",
  );

  add(
    "swapped-source-id",
    "source_id replaced after signing (signature input binds source_id).",
    { ...full(base), source_id: "src_other" },
    "bad_signature",
  );

  add(
    "wrong-public-key",
    "Valid envelope checked against a different source's public key.",
    full(base),
    "bad_signature",
    pairC.publicKeyB64,
  );

  add(
    "unsupported-version",
    'aegis_envelope is "2".',
    { ...full(base), aegis_envelope: "2" },
    "unsupported_version",
  );

  const { signature: _unused, ...noSig } = full(base);
  add("missing-signature", "signature field absent.", noSig, "malformed");

  add(
    "unknown-field",
    "Unexpected top-level field.",
    { ...full(base), extra: "nope" },
    "malformed",
  );

  add(
    "float-in-event",
    "Event contains a non-integer JSON number (money must be a decimal string).",
    {
      ...full(base),
      event: { type: "payout.requested", amount: 12.5 },
      event_hash: "0".repeat(64),
    },
    "malformed",
  );

  add(
    "bad-nonce-length",
    "nonce decodes to 15 bytes instead of 16.",
    { ...full(base), nonce: Buffer.alloc(15, 1).toString("base64url") },
    "malformed",
  );

  return out;
}

async function generate() {
  const vectors = [];
  for (const c of cases) {
    vectors.push(await makeVector(c));
  }
  return {
    spec: "AEGIS-SRC1",
    version: 1,
    notice:
      "ALL KEYS IN THIS FILE ARE TEST-ONLY, PUBLICLY PUBLISHED SEEDS (32 repeated bytes). Never use them for anything real. Generated by conformance/generate-vectors.mjs - do not edit by hand.",
    signature_input:
      'SHA-256("AEGIS-SRC1\\n" + source_id + "\\n" + key_id + "\\n" + JCS(envelope without signature)); Ed25519 over the 32-byte digest',
    vectors,
    negative_vectors: await makeNegatives(vectors),
  };
}

const text = JSON.stringify(await generate(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(outPath, "utf8");
  } catch {
    /* missing */
  }
  if (current.replace(/\r\n/g, "\n") !== text) {
    console.error("conformance/vectors.json is stale; run: node conformance/generate-vectors.mjs");
    process.exit(1);
  }
  console.log("vectors.json is up to date");
} else {
  writeFileSync(outPath, text, "utf8");
  console.log(`wrote ${outPath}`);
}
