import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script shared with the build step; it has no type declarations
import { scanRepo, scanText } from "../../../scripts/check-no-bare-verified.mjs";

type Finding = { file: string; line: number; text: string };
const scan = scanText as (text: string, file?: string) => Finding[];

describe("wording guard: no standalone 'Verified' next to data", () => {
  it("user-facing pages and exports are clean", () => {
    const { scanned, findings } = scanRepo() as { scanned: number; findings: Finding[] };
    expect(scanned).toBeGreaterThan(50);
    expect(
      findings,
      findings.map((f) => `${f.file}:${f.line} "${f.text}"`).join("\n"),
    ).toEqual([]);
  });

  it("catches the wording it exists to stop", () => {
    const bad = [
      `const t = "Verified. Each step is signed and the record is append-only.";`,
      `const t = 'Verified';`,
      "const t = `Verified: unchanged since ${when}`;",
      `<strong>Verified.</strong> Signature chain is intact on every step.`,
      `<span>{ok ? "Verified" : "Verification failed"}</span>`,
      `lines.push({ text: "The record is verified." });`,
    ];
    for (const source of bad) {
      expect(scan(source).length, source).toBeGreaterThan(0);
    }
  });

  it("allows account-email wording and ordinary identifiers", () => {
    const fine = [
      `const label = "Verified email";`,
      `const label = "Your email is verified";`,
      `const label = "Receipt verified";`,
      `const label = "Callback verified (beneficiary bank confirmed)";`,
      `const key = "receipt.verified";`,
      `const verified = await check(); if (!verified) return;`,
      `const ok = row.email_verified_at != null;`,
      `// Verified is never shown next to data`,
      `/* the "Verified" badge was removed */ const x = 1;`,
    ];
    for (const source of fine) {
      expect(scan(source), source).toEqual([]);
    }
  });

  it("an allowed phrase does not hide a bare use in the same string", () => {
    expect(scan(`const t = "Verified email, Verified record";`).length).toBeGreaterThan(0);
  });
});
