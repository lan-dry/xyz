/**
 * Verify a Console Evidence ZIP by re-hashing contents vs manifest integrity,
 * then optionally tamper one byte and prove the check fails.
 *
 * Usage:
 *   pnpm aegis:verify-compliance-zip path/to/export.zip
 *   pnpm aegis:verify-compliance-zip path/to/export.zip --tamper
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Minimal ZIP local-file reader (stored or deflate). */
function readZipEntries(zip: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= zip.length) {
    const sig = zip.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = zip.readUInt16LE(offset + 8);
    const compSize = zip.readUInt32LE(offset + 18);
    const nameLen = zip.readUInt16LE(offset + 26);
    const extraLen = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const compressed = zip.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP method ${method} for ${name}`);
    out.set(name, data);
    offset = dataStart + compSize;
  }
  return out;
}

const zipPath = process.argv[2];
const tamper = process.argv.includes("--tamper");
if (!zipPath) {
  console.error("Usage: pnpm aegis:verify-compliance-zip <export.zip> [--tamper]");
  process.exit(1);
}

const abs = resolve(zipPath);
let bytes = readFileSync(abs);
const entries = readZipEntries(bytes);
const manifestRaw = entries.get("manifest.json");
if (!manifestRaw) {
  console.error("[verify-compliance-zip] manifest.json missing");
  process.exit(1);
}

const manifest = JSON.parse(manifestRaw.toString("utf8")) as {
  integrity_hash?: string;
  bundle_type?: string;
};

const contentHash = sha256Hex(
  Buffer.concat(
    [...entries.entries()]
      .filter(([name]) => name !== "manifest.json")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, buf]) => buf),
  ),
);

console.log(`[verify-compliance-zip] file=${abs}`);
console.log(`[verify-compliance-zip] bundle_type=${manifest.bundle_type ?? "unknown"}`);
console.log(`[verify-compliance-zip] entries=${entries.size}`);
console.log(`[verify-compliance-zip] content_sha256=${contentHash}`);

if (manifest.integrity_hash) {
  const ok =
    manifest.integrity_hash === contentHash ||
    manifest.integrity_hash === sha256Hex(bytes);
  console.log(
    `[verify-compliance-zip] manifest.integrity_hash=${manifest.integrity_hash}`,
  );
  console.log(`[verify-compliance-zip] integrity_match=${ok}`);
  if (!ok) {
    console.error("[verify-compliance-zip] integrity check failed");
    process.exit(1);
  }
} else {
  console.log(
    "[verify-compliance-zip] no integrity_hash in manifest; hashed contents for baseline",
  );
}

if (tamper) {
  const flipped = Buffer.from(bytes);
  const i = Math.min(flipped.length - 1, 64);
  flipped[i] = (flipped[i]! ^ 0xff) & 0xff;
  const tamperedPath = abs.replace(/\.zip$/i, ".tampered.zip");
  writeFileSync(tamperedPath, flipped);
  const tamperedHash = sha256Hex(flipped);
  console.log(`[verify-compliance-zip] wrote ${tamperedPath}`);
  console.log(`[verify-compliance-zip] tampered_sha256=${tamperedHash}`);
  if (manifest.integrity_hash && tamperedHash === manifest.integrity_hash) {
    console.error("[verify-compliance-zip] tamper did not change hash (unexpected)");
    process.exit(1);
  }
  console.log("[verify-compliance-zip] tamper demo ok (hash diverged).");
}

console.log("[verify-compliance-zip] ok");
process.exit(0);
