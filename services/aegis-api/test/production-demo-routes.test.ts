/**
 * Legacy AEGIS_DEMO_MODE must not unlock anything; production still refuses boot.
 * Reason for rewrite: demo clock / assertDemoMode removed; keep boot-guard coverage.
 */
import { afterEach, describe, expect, it } from "vitest";
import { evaluateProductionGuards } from "../src/boot/production-guards.js";
import { isLegacyDemoModeEnvSet } from "../src/time/clock.js";

afterEach(() => {
  delete process.env.AEGIS_DEMO_MODE;
  delete process.env.AEGIS_ENV;
});

describe("legacy AEGIS_DEMO_MODE", () => {
  it("isLegacyDemoModeEnvSet detects truthy values", () => {
    expect(isLegacyDemoModeEnvSet({ AEGIS_DEMO_MODE: "true" })).toBe(true);
    expect(isLegacyDemoModeEnvSet({ AEGIS_DEMO_MODE: "1" })).toBe(true);
    expect(isLegacyDemoModeEnvSet({})).toBe(false);
  });

  it("production boot refuses AEGIS_DEMO_MODE", async () => {
    const report = await evaluateProductionGuards(
      {
        AEGIS_ENV: "production",
        AEGIS_DEMO_MODE: "true",
        DATABASE_URL: "postgresql://app@localhost/db",
        CONSOLE_ORIGIN: "https://app.example.com",
        RESEND_API_KEY: "re_test",
        AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION: "interim",
        AEGIS_RECEIPT_SIGNING_KEY_B64: Buffer.alloc(32).toString("base64"),
        AEGIS_RECEIPT_KEY_ID: "receipt_prod",
      },
      {
        probeDatabaseRole: async () => ({
          role: "aegis_app",
          superuser: false,
          canSetReplicationRole: false,
          ownsAppendOnlyTables: false,
        }),
      },
    );
    expect(report.ok).toBe(false);
    expect(report.failures.some((f) => f.message.includes("AEGIS_DEMO_MODE"))).toBe(true);
  });
});
