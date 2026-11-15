import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yamlPath = join(root, "openapi/bank-events.openapi.yaml");

describe("OpenAPI bank/governed events spec", () => {
  it("declares versioned paths and schemas", () => {
    const text = readFileSync(yamlPath, "utf8");
    expect(text).toMatch(/openapi:\s*3/);
    expect(text).toMatch(/version:\s*0\.1\.0/);
    expect(text).toContain("/bank/events");
    expect(text).toContain("/governed/events/batch");
    expect(text).toContain("/bank/events/batch");
    expect(text).toContain("BankEvent");
    expect(text).toContain("BankDecisionResponse");
    expect(text).toContain("ValidationError");
    expect(text).toMatch(/allow.*hold.*stop/s);
  });
});
