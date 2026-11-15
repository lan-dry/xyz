import { afterEach, describe, expect, it } from "vitest";
import { DemoClockError } from "../src/bank/demo-clock.js";
import {
  demoApprovalPassword,
  seedDemoApprovalActors,
} from "../src/demo/seed-approval-actors.js";

describe("seedDemoApprovalActors / demoApprovalPassword demo gate", () => {
  const prev = {
    AEGIS_DEMO_MODE: process.env.AEGIS_DEMO_MODE,
    NODE_ENV: process.env.NODE_ENV,
    AEGIS_ENV: process.env.AEGIS_ENV,
    AEGIS_DEMO_APPROVAL_PASSWORD: process.env.AEGIS_DEMO_APPROVAL_PASSWORD,
    AEGIS_ALLOW_DEMO_ON_NAMED_DB: process.env.AEGIS_ALLOW_DEMO_ON_NAMED_DB,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("demoApprovalPassword throws when AEGIS_DEMO_MODE is unset", () => {
    delete process.env.AEGIS_DEMO_MODE;
    process.env.NODE_ENV = "test";
    delete process.env.AEGIS_ENV;
    expect(() => demoApprovalPassword()).toThrow(/refused|demo/i);
  });

  it("demoApprovalPassword throws when AEGIS_DEMO_MODE is false", () => {
    process.env.AEGIS_DEMO_MODE = "false";
    process.env.NODE_ENV = "test";
    expect(() => demoApprovalPassword()).toThrow(/refused|demo/i);
  });

  it("demoApprovalPassword throws when NODE_ENV=production even if demo flag set", () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.NODE_ENV = "production";
    expect(() => demoApprovalPassword()).toThrow(/refused|demo|production/i);
  });

  it("seedDemoApprovalActors throws via assertDemoMode when demo disallowed", async () => {
    delete process.env.AEGIS_DEMO_MODE;
    process.env.NODE_ENV = "test";
    const fakeClient = {
      query: async () => {
        throw new Error("query must not run");
      },
    };
    await expect(
      seedDemoApprovalActors(
        fakeClient as never,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toBeInstanceOf(DemoClockError);
  });

  it("returns password from env when demo mode is allowed", () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.NODE_ENV = "test";
    delete process.env.AEGIS_ENV;
    process.env.DATABASE_URL = "postgres://localhost/aegis_dev";
    process.env.AEGIS_DEMO_APPROVAL_PASSWORD = "test-demo-password-ok";
    expect(demoApprovalPassword()).toBe("test-demo-password-ok");
  });

  it("refuses when demo mode is on but password env is missing", () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.NODE_ENV = "test";
    delete process.env.AEGIS_ENV;
    process.env.DATABASE_URL = "postgres://localhost/aegis_dev";
    delete process.env.AEGIS_DEMO_APPROVAL_PASSWORD;
    expect(() => demoApprovalPassword()).toThrow(/AEGIS_DEMO_APPROVAL_PASSWORD/i);
  });
});
