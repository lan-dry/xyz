import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApsValidationError, validateEvent } from "./schema.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/aegis");

describe("APS schema validation", () => {
  it("accepts a valid Tier-A fixture", () => {
    const event = JSON.parse(readFileSync(join(fixtures, "valid-tier-a-event.json"), "utf8"));
    expect(() => validateEvent(event)).not.toThrow();
  });

  it("rejects missing actor", () => {
    const event = JSON.parse(readFileSync(join(fixtures, "invalid-missing-actor.json"), "utf8"));
    expect(() => validateEvent(event)).toThrow(ApsValidationError);
    try {
      validateEvent(event);
    } catch (err) {
      expect((err as ApsValidationError).details.join(" ")).toMatch(/actor/i);
    }
  });

  it("rejects malformed signature placeholder", () => {
    const event = JSON.parse(
      readFileSync(join(fixtures, "invalid-malformed-signature.json"), "utf8"),
    );
    expect(() => validateEvent(event)).toThrow(ApsValidationError);
    try {
      validateEvent(event);
    } catch (err) {
      const details = (err as ApsValidationError).details.join(" ");
      expect(details).toMatch(/signature/i);
    }
  });
});
