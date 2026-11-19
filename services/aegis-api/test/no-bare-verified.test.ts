import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const script = resolve(repoRoot, "scripts/check-no-bare-verified.mjs");
const probe = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/no-bare-verified-probe.mjs",
);

describe("wording guard: no standalone 'Verified' next to data", () => {
  it("user-facing pages and exports are clean", () => {
    const out = execFileSync(process.execPath, [script], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(out).toMatch(/Wording check passed: \d+ files scanned/);
  });

  it("catches bad wording and allows account/identifier phrasing", () => {
    const out = execFileSync(process.execPath, [probe], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(out).toContain("probe-ok");
  });
});
