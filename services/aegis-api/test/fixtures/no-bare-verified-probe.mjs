import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/check-no-bare-verified.mjs",
);
const { scanText } = await import(pathToFileURL(script).href);

const bad = [
  'const t = "Verified. Each step is signed and the record is append-only.";',
  "const t = 'Verified';",
  "const t = `Verified: unchanged since ${when}`;",
  "<strong>Verified.</strong> Signature chain is intact on every step.",
  '<span>{ok ? "Verified" : "Verification failed"}</span>',
  'lines.push({ text: "The record is verified." });',
];
for (const source of bad) {
  if (scanText(source).length === 0) {
    console.error("MISS", source);
    process.exit(2);
  }
}

const fine = [
  'const label = "Verified email";',
  'const label = "Your email is verified";',
  'const label = "Receipt verified";',
  'const label = "Callback verified (beneficiary bank confirmed)";',
  'const key = "receipt.verified";',
  "const verified = await check(); if (!verified) return;",
  "const ok = row.email_verified_at != null;",
];
for (const source of fine) {
  const hits = scanText(source);
  if (hits.length !== 0) {
    console.error("FALSE_POS", source, hits);
    process.exit(2);
  }
}

console.log("probe-ok");
